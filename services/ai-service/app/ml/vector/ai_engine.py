"""Shared AI engine: bi-encoder and cross-encoder loaded exactly once."""

from __future__ import annotations

import logging
import threading
from typing import TYPE_CHECKING, Any, ClassVar

from app.ml.vector.chroma_client import (
    create_persistent_client,
    get_or_create_collections,
    get_or_create_reviewer_collections,
)
from app.ml.vector.config import VectorConfig
from app.ml.vector.types import VectorDependenciesError

if TYPE_CHECKING:
    from sentence_transformers import CrossEncoder, SentenceTransformer

logger = logging.getLogger(__name__)


def similarity_from_distance(distance: float) -> float:
    """Convert Chroma cosine distance to similarity in [0, 1]."""
    return max(0.0, min(1.0, 1.0 - distance))


class AIEngine:
    """
    Thread-safe singleton that owns Chroma collections and both encoders.

    Chroma and the bi-encoder load on first embed/query. The cross-encoder loads
    only when reranking (semantic search), not for similar-articles or ingest.
    """

    _instance: ClassVar[AIEngine | None] = None
    _lock: ClassVar[threading.Lock] = threading.Lock()

    def __init__(self, config: VectorConfig) -> None:
        self._config = config
        self._client: Any = None
        self._summary_collection: Any = None
        self._chunks_collection: Any = None
        self._reviewers_collection: Any = None
        self._reviewer_history_collection: Any = None
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
        """Clear singleton (for tests)."""
        with cls._lock:
            cls._instance = None

    def _initialize(self) -> None:
        """Load Chroma and bi-encoder (cross-encoder is lazy)."""
        with self._init_lock:
            if self._client is not None:
                return
            self._client = create_persistent_client(self._config)
            self._summary_collection, self._chunks_collection = get_or_create_collections(
                self._client,
            )
            self._reviewers_collection, self._reviewer_history_collection = (
                get_or_create_reviewer_collections(self._client)
            )
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
    def client(self) -> Any:
        self._ensure_ready()
        return self._client

    @property
    def summary_collection(self) -> Any:
        self._ensure_ready()
        return self._summary_collection

    @property
    def chunks_collection(self) -> Any:
        self._ensure_ready()
        return self._chunks_collection

    @property
    def reviewers_collection(self) -> Any:
        self._ensure_ready()
        return self._reviewers_collection

    @property
    def reviewer_history_collection(self) -> Any:
        self._ensure_ready()
        return self._reviewer_history_collection

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
        if self._client is None:
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
