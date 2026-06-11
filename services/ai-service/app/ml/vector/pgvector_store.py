"""pgvector-backed VectorStore."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.ml.vector.config import EMBEDDING_DIM
from app.ml.vector.pg_pool import VectorDbConfig, close_pool, get_pool, open_pool
from app.ml.vector.vector_store import (
    ChunkRow,
    ReviewerBioRow,
    SimilarChunkHit,
    SimilarSummaryHit,
    SubmissionSummaryLookup,
    SummaryRow,
    VectorStore,
)

if TYPE_CHECKING:
    from psycopg_pool import ConnectionPool

logger = logging.getLogger(__name__)

_SUMMARY_TABLE = "article_summary_embeddings"
_CHUNK_TABLE = "article_chunk_embeddings"
_REVIEWER_TABLE = "reviewer_bio_embeddings"


def assert_embedding_schema(pool: ConnectionPool, expected_dim: int = EMBEDDING_DIM) -> None:
    """Fail fast if migration dimension does not match the bi-encoder."""
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT a.atttypmod
                FROM pg_catalog.pg_attribute a
                JOIN pg_catalog.pg_class c ON a.attrelid = c.oid
                WHERE c.relname = %s
                  AND a.attname = 'embedding'
                  AND NOT a.attisdropped
                """,
                (_SUMMARY_TABLE,),
            )
            row = cur.fetchone()
    if row is None:
        raise RuntimeError(
            f"Table {_SUMMARY_TABLE} is missing or has no embedding column — run migrations",
        )
    typmod = int(row[0])
    if typmod != expected_dim:
        raise RuntimeError(
            f"Embedding dimension mismatch: database vector({typmod}) "
            f"!= model dimension {expected_dim}",
        )


class PgVectorStore:
    """Read/write embeddings in folio_review via psycopg3 (sync pool)."""

    def __init__(self, pool: ConnectionPool) -> None:
        self._pool = pool

    @classmethod
    def open(cls, db_config: VectorDbConfig) -> PgVectorStore:
        pool = open_pool(db_config)
        assert_embedding_schema(pool)
        return cls(pool)

    def close(self) -> None:
        close_pool()

    def upsert_summary(self, row: SummaryRow) -> None:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    INSERT INTO {_SUMMARY_TABLE} (
                      submission_id, embedding, summary_text, abstract, keywords, category
                    ) VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (submission_id) DO UPDATE SET
                      embedding = EXCLUDED.embedding,
                      summary_text = EXCLUDED.summary_text,
                      abstract = EXCLUDED.abstract,
                      keywords = EXCLUDED.keywords,
                      category = EXCLUDED.category,
                      indexed_at = now()
                    """,
                    (
                        row.submission_id,
                        row.embedding,
                        row.summary_text,
                        row.abstract,
                        row.keywords,
                        row.category,
                    ),
                )
            conn.commit()

    def get_summary(self, submission_id: str) -> SummaryRow | None:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT submission_id, embedding, summary_text, abstract, keywords, category
                    FROM {_SUMMARY_TABLE}
                    WHERE submission_id = %s
                    """,
                    (submission_id,),
                )
                row = cur.fetchone()
        if row is None:
            return None
        return SummaryRow(
            submission_id=str(row[0]),
            embedding=list(row[1]),
            summary_text=row[2],
            abstract=row[3],
            keywords=row[4],
            category=row[5],
        )

    def delete_summary(self, submission_id: str) -> None:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"DELETE FROM {_SUMMARY_TABLE} WHERE submission_id = %s",
                    (submission_id,),
                )
            conn.commit()

    def query_similar_summaries(
        self,
        embedding: list[float],
        *,
        limit: int,
        category: str | None = None,
        exclude_submission_id: str | None = None,
    ) -> list[SimilarSummaryHit]:
        clauses = ["1=1"]
        where_params: list[object] = []
        if category:
            clauses.append("category = %s")
            where_params.append(category)
        if exclude_submission_id:
            clauses.append("submission_id <> %s::uuid")
            where_params.append(exclude_submission_id)

        where_sql = " AND ".join(clauses)
        params: list[object] = [embedding, *where_params, embedding, limit]
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT submission_id, abstract, keywords, category,
                           1 - (embedding <=> %s) AS similarity
                    FROM {_SUMMARY_TABLE}
                    WHERE {where_sql}
                    ORDER BY embedding <=> %s
                    LIMIT %s
                    """,
                    params,
                )
                rows = cur.fetchall()

        return [
            SimilarSummaryHit(
                submission_id=str(r[0]),
                abstract=r[1] or "",
                keywords=r[2] or "",
                category=r[3] or "",
                similarity=float(r[4]),
            )
            for r in rows
        ]

    def get_submission_summaries_by_ids(
        self,
        submission_ids: list[str],
    ) -> list[SubmissionSummaryLookup]:
        if not submission_ids:
            return []
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT submission_id, embedding, summary_text
                    FROM {_SUMMARY_TABLE}
                    WHERE submission_id = ANY(%s::uuid[])
                    """,
                    (submission_ids,),
                )
                rows = cur.fetchall()
        return [
            SubmissionSummaryLookup(
                submission_id=str(r[0]),
                embedding=list(r[1]),
                summary_text=r[2] or "",
            )
            for r in rows
        ]

    def replace_chunks(self, article_id: str, rows: list[ChunkRow]) -> None:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"DELETE FROM {_CHUNK_TABLE} WHERE article_id = %s",
                    (article_id,),
                )
                if rows:
                    cur.executemany(
                        f"""
                        INSERT INTO {_CHUNK_TABLE} (
                          article_id, chunk_index, embedding, chunk_text, category
                        ) VALUES (%s, %s, %s, %s, %s)
                        """,
                        [
                            (
                                row.article_id,
                                row.chunk_index,
                                row.embedding,
                                row.chunk_text,
                                row.category,
                            )
                            for row in rows
                        ],
                    )
            conn.commit()

    def delete_chunks(self, article_id: str) -> None:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"DELETE FROM {_CHUNK_TABLE} WHERE article_id = %s",
                    (article_id,),
                )
            conn.commit()

    def query_similar_chunks(
        self,
        embeddings: list[list[float]],
        *,
        limit_per_query: int,
        category: str | None = None,
    ) -> list[list[SimilarChunkHit]]:
        if not embeddings:
            return []

        results: list[list[SimilarChunkHit]] = []
        category_clause = ""
        category_param: tuple[object, ...] = ()
        if category:
            category_clause = "AND category = %s"
            category_param = (category,)

        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                for embedding in embeddings:
                    cur.execute(
                        f"""
                        SELECT article_id, chunk_index, chunk_text, category,
                               1 - (embedding <=> %s) AS similarity
                        FROM {_CHUNK_TABLE}
                        WHERE 1=1 {category_clause}
                        ORDER BY embedding <=> %s
                        LIMIT %s
                        """,
                        (embedding, *category_param, embedding, limit_per_query),
                    )
                    rows = cur.fetchall()
                    results.append(
                        [
                            SimilarChunkHit(
                                article_id=str(r[0]),
                                chunk_index=int(r[1]),
                                chunk_text=r[2] or "",
                                category=r[3] or "",
                                similarity=float(r[4]),
                            )
                            for r in rows
                        ],
                    )
        return results

    def upsert_reviewer_bio(self, row: ReviewerBioRow) -> None:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    INSERT INTO {_REVIEWER_TABLE} (
                      reviewer_id, embedding, bio_text, display_name
                    ) VALUES (%s, %s, %s, %s)
                    ON CONFLICT (reviewer_id) DO UPDATE SET
                      embedding = EXCLUDED.embedding,
                      bio_text = EXCLUDED.bio_text,
                      display_name = EXCLUDED.display_name,
                      indexed_at = now()
                    """,
                    (
                        row.reviewer_id,
                        row.embedding,
                        row.bio_text,
                        row.display_name,
                    ),
                )
            conn.commit()

    def delete_reviewer_bio(self, reviewer_id: str) -> None:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"DELETE FROM {_REVIEWER_TABLE} WHERE reviewer_id = %s",
                    (reviewer_id,),
                )
            conn.commit()

    def list_reviewer_ids(self) -> list[str]:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"SELECT reviewer_id::text FROM {_REVIEWER_TABLE}")
                return [str(row[0]) for row in cur.fetchall()]

    def get_reviewer_bios(self, reviewer_ids: list[str]) -> list[ReviewerBioRow]:
        if not reviewer_ids:
            return []
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT reviewer_id, embedding, bio_text, display_name
                    FROM {_REVIEWER_TABLE}
                    WHERE reviewer_id = ANY(%s::uuid[])
                    ORDER BY reviewer_id
                    """,
                    (reviewer_ids,),
                )
                rows = cur.fetchall()
        return [
            ReviewerBioRow(
                reviewer_id=str(r[0]),
                embedding=list(r[1]),
                bio_text=r[2] or "",
                display_name=r[3],
            )
            for r in rows
        ]
