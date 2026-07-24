"""Sync psycopg3 connection pool for pgvector.

Vector DB work runs inside ``asyncio.to_thread`` from async gRPC handlers, so a
sync ``ConnectionPool`` is intentional — do not use ``AsyncConnectionPool`` unless
the entire vector stack is refactored to async.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.ml.vector.types import VectorDependenciesError

if TYPE_CHECKING:
    from psycopg_pool import ConnectionPool

logger = logging.getLogger(__name__)

_pool: ConnectionPool | None = None


@dataclass(frozen=True)
class VectorDbConfig:
    host: str = "localhost"
    port: int = 5432
    user: str = "postgres"
    password: str = ""
    database: str = "folio_review"
    ssl: bool = False
    min_pool_size: int = 1
    max_pool_size: int = 10
    hnsw_ef_search: int = 64

    def conninfo(self) -> str:
        sslmode = "require" if self.ssl else "disable"
        return (
            f"host={self.host} port={self.port} dbname={self.database} "
            f"user={self.user} password={self.password} sslmode={sslmode}"
        )


def _require_psycopg() -> None:
    try:
        import psycopg  # noqa: F401
        from pgvector.psycopg import register_vector  # noqa: F401
        from psycopg_pool import ConnectionPool  # noqa: F401
    except ImportError as err:
        raise VectorDependenciesError(
            "pgvector dependencies are not installed. "
            'Run: pip install -e ".[similarity]"',
        ) from err


def _configure_connection(conn: object, *, hnsw_ef_search: int) -> None:
    from pgvector.psycopg import register_vector

    register_vector(conn)
    # SET must run in autocommit so the connection stays IDLE after configure;
    # psycopg-pool discards connections left in INTRANS after the configure hook.
    conn.autocommit = True  # type: ignore[attr-defined]
    with conn.cursor() as cur:  # type: ignore[attr-defined]
        cur.execute(f"SET hnsw.ef_search = {hnsw_ef_search}")
    conn.autocommit = False  # type: ignore[attr-defined]


def open_pool(config: VectorDbConfig) -> ConnectionPool:
    """Open the process-wide vector DB pool (idempotent)."""
    global _pool
    _require_psycopg()
    from psycopg_pool import ConnectionPool

    if _pool is not None:
        return _pool

    ef_search = config.hnsw_ef_search

    def configure(conn: object) -> None:
        _configure_connection(conn, hnsw_ef_search=ef_search)

    _pool = ConnectionPool(
        conninfo=config.conninfo(),
        min_size=config.min_pool_size,
        max_size=config.max_pool_size,
        configure=configure,
        open=False,
    )
    _pool.open()
    logger.info(
        "Vector DB pool opened (host=%s db=%s hnsw.ef_search=%s)",
        config.host,
        config.database,
        ef_search,
    )
    return _pool


def get_pool() -> ConnectionPool:
    if _pool is None:
        raise RuntimeError("Vector DB pool is not open")
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is None:
        return
    _pool.close()
    _pool = None
    logger.info("Vector DB pool closed")


def pool_is_open() -> bool:
    return _pool is not None
