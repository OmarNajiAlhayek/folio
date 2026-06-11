"""Shared AI engine: bi-encoder and cross-encoder loaded exactly once."""

from __future__ import annotations

import logging
import threading
from typing import TYPE_CHECKING, ClassVar

from app.ml.vector.config import VectorConfig
from app.ml.vector.pg_pool import VectorDbConfig, close_pool
from app.ml.vector.pgvector_store import PgVectorStore
from app.ml.vector.scoring import similarity_from_pgvector_distance
from app.ml.vector.types import VectorDependenciesError
from app.ml.vector.vector_store import VectorStore

if TYPE_CHECKING:
    from sentence_transformers import CrossEncoder, SentenceTransformer

logger = logging.getLogger(__name__)

# Backward-compatible alias for services that imported similarity_from_distance.
similarity_from_distance = similarity_from_pgvector_distance


class AIEngine:
    """
    Thread-safe singleton that owns the vector store and both encoders.

    The pgvector pool and bi-encoder load on first embed/query. The cross-encoder
    loads only when reranking (reviewer matching), not for similar-articles or ingest.
    """

    _instance: ClassVar[AIEngine | None] = None
    _lock: ClassVar[threading.Lock] = threading.Lock()

    def __init__(self, config: VectorConfig) -> None:
        self._config = config
        self._store: VectorStore | None = None
        self._bi_encoder: SentenceTransformer | None = None
        self._cross_encoder: CrossEncoder | None = None
        self._init_lock = threading.Lock()

    @classmethod
    def get_instance(cls, config: VectorConfig | None = None) -> AIEngine:
        cfg = config or VectorConfig()
        if cls._instance is not None:
            return cls._instance
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls(cfg)
                cls._instance._initialize()
            return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Clear singleton and close the vector DB pool (for tests)."""
        with cls._lock:
            if cls._instance is not None:
                cls._instance._store = None
            close_pool()
            cls._instance = None

    @classmethod
    def shutdown(cls) -> None:
        """Close pool on process shutdown."""
        cls.reset_instance()

    def _initialize(self) -> None:
        """Open pgvector pool and load bi-encoder (cross-encoder is lazy)."""
        with self._init_lock:
            if self._store is not None:
                return
            db_config = VectorDbConfig(
                host=self._config.vector_db_host,
                port=self._config.vector_db_port,
                user=self._config.vector_db_user,
                password=self._config.vector_db_password,
                database=self._config.vector_db_database,
                ssl=self._config.vector_db_ssl,
                hnsw_ef_search=self._config.vector_db_hnsw_ef_search,
            )
            self._store = PgVectorStore.open(db_config)
            self._load_bi_encoder()

    def _ensure_cross_encoder(self) -> None:
        """Load cross-encoder on first rerank (search), not for similar-articles."""
        self._ensure_ready()
        with self._init_lock:
            if self._cross_encoder is not None:
                return
            self._load_cross_encoder()

    def _load_bi_encoder(self) -> None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as err:
            raise VectorDependenciesError(
                'sentence-transformers is required. Run: pip install -e ".[similarity]"',
            ) from err

        device = self._config.resolved_device()
        logger.info(
            "Loading bi-encoder %s on %s",
            self._config.bi_encoder_model,
            device,
        )
        self._bi_encoder = SentenceTransformer(
            self._config.bi_encoder_model,
            device=device,
        )

    def _load_cross_encoder(self) -> None:
        try:
            from sentence_transformers import CrossEncoder
        except ImportError as err:
            raise VectorDependenciesError(
                'sentence-transformers is required. Run: pip install -e ".[similarity]"',
            ) from err

        device = self._config.resolved_device()
        logger.info(
            "Loading cross-encoder %s on %s",
            self._config.cross_encoder_model,
            device,
        )
        self._cross_encoder = CrossEncoder(
            self._config.cross_encoder_model,
            device=device,
        )

    @property
    def config(self) -> VectorConfig:
        return self._config

    @property
    def store(self) -> VectorStore:
        self._ensure_ready()
        assert self._store is not None
        return self._store

    @property
    def bi_encoder(self) -> SentenceTransformer:
        self._ensure_ready()
        assert self._bi_encoder is not None
        return self._bi_encoder

    @property
    def cross_encoder(self) -> CrossEncoder:
        self._ensure_cross_encoder()
        assert self._cross_encoder is not None
        return self._cross_encoder

    def _ensure_ready(self) -> None:
        if self._store is None:
            self._initialize()

    def embed(self, texts: list[str]) -> list[list[float]]:
        """Batch-embed texts with the bi-encoder."""
        if not texts:
            return []
        self._ensure_ready()
        assert self._bi_encoder is not None
        vectors = self._bi_encoder.encode(
            texts,
            batch_size=self._config.batch_size,
            convert_to_tensor=False,
            show_progress_bar=False,
        )
        return vectors.tolist()

    def rerank(
        self,
        pairs: list[tuple[str, str]],
    ) -> list[float]:
        """Score (query, document) pairs with the cross-encoder."""
        if not pairs:
            return []
        self._ensure_cross_encoder()
        assert self._cross_encoder is not None
        scores = self._cross_encoder.predict(
            pairs,
            batch_size=self._config.batch_size,
        )
        return [float(s) for s in scores]
