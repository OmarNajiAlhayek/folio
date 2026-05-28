"""ChromaDB client and collection accessors."""

from __future__ import annotations

import logging
from typing import Any

from app.ml.vector.config import (
    CHUNKS_COLLECTION_NAME,
    REVIEWER_HISTORY_COLLECTION_NAME,
    REVIEWERS_COLLECTION_NAME,
    SUMMARY_COLLECTION_NAME,
    VectorConfig,
)
from app.ml.vector.types import VectorDependenciesError

logger = logging.getLogger(__name__)

_COSINE_METADATA = {"hnsw:space": "cosine"}


def require_vector_deps() -> None:
    try:
        import chromadb  # noqa: F401
        from sentence_transformers import CrossEncoder, SentenceTransformer  # noqa: F401
    except ImportError as err:
        raise VectorDependenciesError(
            "Vector search dependencies are not installed. "
            'Run: pip install -e ".[similarity]"',
        ) from err


def create_persistent_client(config: VectorConfig) -> Any:
    """Create a Chroma persistent client."""
    require_vector_deps()
    import chromadb

    return chromadb.PersistentClient(path=config.chroma_path)


def get_or_create_collections(
    client: Any,
) -> tuple[Any, Any]:
    """Return (summary_collection, chunks_collection)."""
    summary = client.get_or_create_collection(
        name=SUMMARY_COLLECTION_NAME,
        metadata=_COSINE_METADATA,
    )
    chunks = client.get_or_create_collection(
        name=CHUNKS_COLLECTION_NAME,
        metadata=_COSINE_METADATA,
    )
    logger.info(
        "Chroma collections ready: %s (count=%s), %s (count=%s)",
        SUMMARY_COLLECTION_NAME,
        summary.count(),
        CHUNKS_COLLECTION_NAME,
        chunks.count(),
    )
    return summary, chunks


def get_or_create_reviewer_collections(
    client: Any,
) -> tuple[Any, Any]:
    """Return (reviewers_collection, reviewer_history_collection)."""
    reviewers = client.get_or_create_collection(
        name=REVIEWERS_COLLECTION_NAME,
        metadata=_COSINE_METADATA,
    )
    history = client.get_or_create_collection(
        name=REVIEWER_HISTORY_COLLECTION_NAME,
        metadata=_COSINE_METADATA,
    )
    logger.info(
        "Chroma reviewer collections ready: %s (count=%s), %s (count=%s)",
        REVIEWERS_COLLECTION_NAME,
        reviewers.count(),
        REVIEWER_HISTORY_COLLECTION_NAME,
        history.count(),
    )
    return reviewers, history
