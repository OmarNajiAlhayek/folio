"""Integration tests for PgVectorStore (requires pgvector Postgres + migrations)."""

from __future__ import annotations

import os

import pytest

from app.ml.vector.config import EMBEDDING_DIM
from app.ml.vector.pg_pool import VectorDbConfig, close_pool
from app.ml.vector.pgvector_store import PgVectorStore, assert_embedding_schema


def _integration_enabled() -> bool:
    return os.environ.get("VECTOR_DB_INTEGRATION", "").lower() in {"1", "true", "yes"}


@pytest.fixture
def pg_store() -> PgVectorStore:
    close_pool()
    config = VectorDbConfig(
        host=os.environ.get("VECTOR_DB_HOST", "localhost"),
        port=int(os.environ.get("VECTOR_DB_PORT", "5432")),
        user=os.environ.get("VECTOR_DB_USER", "postgres"),
        password=os.environ.get("VECTOR_DB_PASSWORD", "changeme"),
        database=os.environ.get("VECTOR_DB_DATABASE", "folio_review"),
    )
    store = PgVectorStore.open(config)
    yield store
    store.close()


@pytest.mark.similarity
@pytest.mark.skipif(
    not _integration_enabled(),
    reason="Set VECTOR_DB_INTEGRATION=1 to run pgvector integration tests",
)
def test_dimension_assertion(pg_store: PgVectorStore) -> None:
    from app.ml.vector.pg_pool import get_pool

    assert_embedding_schema(get_pool(), expected_dim=EMBEDDING_DIM)
