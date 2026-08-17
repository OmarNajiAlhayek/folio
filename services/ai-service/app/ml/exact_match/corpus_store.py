"""Postgres storage for the exact-match corpus.

Two tables carry the whole feature:

- ``corpus_documents`` — one row per indexed document, with ``retained_text``
  populated only when we are allowed to keep the text (Folio's own articles and
  the university back catalogue). That column holds the **original** extract for
  quotable evidence; normalized form is never persisted. External open-access
  documents are stored as fingerprints plus a URL, which is one-way and
  redistributes nothing.
- ``corpus_fingerprints`` — ``(doc_id, hash, word_pos)`` with a btree on ``hash``.
  Lookup is an index probe per query hash, so corpus size costs log time, not a scan.

``corpus_common_hashes`` is the boilerplate stoplist, refreshed by
:meth:`CorpusStore.refresh_common_hashes` after bulk imports.
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from app.ml.exact_match.types import (
    CorpusDocument,
    ExactMatchDependenciesError,
    SourceKind,
)
from app.ml.vector.pg_pool import VectorDbConfig

if TYPE_CHECKING:
    from psycopg_pool import ConnectionPool

logger = logging.getLogger(__name__)

_DOC_TABLE = "corpus_documents"
_FP_TABLE = "corpus_fingerprints"
_COMMON_TABLE = "corpus_common_hashes"

_pool: ConnectionPool | None = None


@dataclass(frozen=True)
class Posting:
    doc_id: str
    hash: int
    word_pos: int


@dataclass(frozen=True)
class StoredDocument:
    doc_id: str
    source_kind: SourceKind
    source_ref: str
    title: str
    source_url: str
    submission_id: str | None
    token_count: int
    retained_text: str | None
    # Digest of the *normalized* text (callers hash after folding). Two rows
    # sharing it are the same article reached by two routes, which the report
    # must not present as two sources.
    content_hash: str = ""


@dataclass(frozen=True)
class IndexResult:
    doc_id: str
    token_count: int
    fingerprint_count: int
    unchanged: bool = False


def content_digest(normalized_text: str) -> str:
    """
    SHA-256 of the **normalized** text — lets importers skip unchanged documents.

    Callers must pass the space-joined folded token string, not the original body.
    """
    return hashlib.sha256(normalized_text.encode("utf-8")).hexdigest()


def _require_psycopg() -> None:
    try:
        import psycopg  # noqa: F401
        from psycopg_pool import ConnectionPool  # noqa: F401
    except ImportError as err:
        raise ExactMatchDependenciesError(
            'psycopg is required for the exact-match corpus. Run: pip install -e ".[similarity]"',
        ) from err


def open_corpus_pool(config: VectorDbConfig) -> ConnectionPool:
    """
    Open the process-wide corpus pool (idempotent).

    Separate from the pgvector pool on purpose: no ``register_vector`` and no
    ``hnsw.ef_search``, so exact matching works on a deployment without embeddings.
    """
    global _pool
    _require_psycopg()
    from psycopg_pool import ConnectionPool

    if _pool is not None:
        return _pool

    _pool = ConnectionPool(
        conninfo=config.conninfo(),
        min_size=config.min_pool_size,
        max_size=config.max_pool_size,
        open=False,
    )
    _pool.open()
    logger.info(
        "Corpus pool opened (host=%s db=%s)",
        config.host,
        config.database,
    )
    return _pool


def close_corpus_pool() -> None:
    global _pool
    if _pool is None:
        return
    _pool.close()
    _pool = None
    logger.info("Corpus pool closed")


class CorpusStore:
    """Read/write the exact-match corpus tables."""

    def __init__(self, pool: ConnectionPool) -> None:
        self._pool = pool

    @classmethod
    def open(cls, config: VectorDbConfig) -> CorpusStore:
        return cls(open_corpus_pool(config))

    def close(self) -> None:
        close_corpus_pool()

    # ---------------------------------------------------------------- writes

    def upsert_document(
        self,
        document: CorpusDocument,
        *,
        fingerprints: list[tuple[int, int]],
        token_count: int,
        retained_text: str | None,
        content_hash: str,
        skip_if_unchanged: bool = True,
    ) -> IndexResult:
        """
        Replace a document and its fingerprints in one transaction.

        Identity is ``(source_kind, source_ref)``, so re-importing the same PDF or
        DOI updates in place instead of duplicating.
        """
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                if skip_if_unchanged:
                    cur.execute(
                        f"""
                        SELECT id::text, content_hash, token_count
                        FROM {_DOC_TABLE}
                        WHERE source_kind = %s AND source_ref = %s
                        """,
                        (str(document.source_kind), document.source_ref),
                    )
                    existing = cur.fetchone()
                    if existing is not None and existing[1] == content_hash:
                        logger.debug(
                            "Corpus document unchanged, skipping re-fingerprint: %s/%s",
                            document.source_kind,
                            document.source_ref,
                        )
                        return IndexResult(
                            doc_id=existing[0],
                            token_count=int(existing[2]),
                            fingerprint_count=0,
                            unchanged=True,
                        )

                cur.execute(
                    f"""
                    INSERT INTO {_DOC_TABLE} (
                      source_kind, source_ref, submission_id, title, authors,
                      language, category, published_year, source_url, license,
                      token_count, retained_text, content_hash
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (source_kind, source_ref) DO UPDATE SET
                      submission_id = EXCLUDED.submission_id,
                      title = EXCLUDED.title,
                      authors = EXCLUDED.authors,
                      language = EXCLUDED.language,
                      category = EXCLUDED.category,
                      published_year = EXCLUDED.published_year,
                      source_url = EXCLUDED.source_url,
                      license = EXCLUDED.license,
                      token_count = EXCLUDED.token_count,
                      retained_text = EXCLUDED.retained_text,
                      content_hash = EXCLUDED.content_hash,
                      indexed_at = now()
                    RETURNING id::text
                    """,
                    (
                        str(document.source_kind),
                        document.source_ref,
                        document.submission_id,
                        document.title,
                        document.authors,
                        document.language,
                        document.category,
                        document.published_year,
                        document.source_url,
                        document.license,
                        token_count,
                        retained_text,
                        content_hash,
                    ),
                )
                row = cur.fetchone()
                assert row is not None
                doc_id = str(row[0])

                cur.execute(f"DELETE FROM {_FP_TABLE} WHERE doc_id = %s::uuid", (doc_id,))
                if fingerprints:
                    with cur.copy(
                        f"COPY {_FP_TABLE} (doc_id, hash, word_pos) FROM STDIN",
                    ) as copy:
                        for hash_value, word_pos in fingerprints:
                            copy.write_row((doc_id, hash_value, word_pos))
            conn.commit()

        logger.info(
            "Indexed corpus document %s (%s/%s): %d tokens, %d fingerprints",
            doc_id,
            document.source_kind,
            document.source_ref,
            token_count,
            len(fingerprints),
        )
        return IndexResult(
            doc_id=doc_id,
            token_count=token_count,
            fingerprint_count=len(fingerprints),
        )

    def delete_document(self, source_kind: SourceKind, source_ref: str) -> bool:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"DELETE FROM {_DOC_TABLE} WHERE source_kind = %s AND source_ref = %s",
                    (str(source_kind), source_ref),
                )
                deleted = cur.rowcount
            conn.commit()
        return deleted > 0

    def quarantine_document(self, doc_id: str) -> int:
        """
        Make a document unreachable without dropping its identity row.

        Deletes all fingerprint postings and clears ``retained_text``. Keeps
        ``content_hash`` so re-importing the same broken PDF hits
        ``skip_if_unchanged`` and stays quarantined; a real OCR pass changes the
        hash and repairs the row. Fingerprints are the reachability edge — clearing
        text alone would leave phantom matches with empty evidence.
        """
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"DELETE FROM {_FP_TABLE} WHERE doc_id = %s::uuid",
                    (doc_id,),
                )
                removed = cur.rowcount
                cur.execute(
                    f"""
                    UPDATE {_DOC_TABLE}
                    SET retained_text = NULL, token_count = 0
                    WHERE id = %s::uuid
                    """,
                    (doc_id,),
                )
            conn.commit()
        return removed

    def delete_by_submission(self, submission_id: str) -> bool:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"DELETE FROM {_DOC_TABLE} WHERE submission_id = %s::uuid",
                    (submission_id,),
                )
                deleted = cur.rowcount
            conn.commit()
        return deleted > 0

    # ----------------------------------------------------------------- reads

    def query_postings(
        self,
        hashes: list[int],
        *,
        max_postings_per_hash: int,
        exclude_doc_ids: list[str] | None = None,
        exclude_submission_ids: list[str] | None = None,
        source_kinds: list[SourceKind] | None = None,
    ) -> list[Posting]:
        """
        Look up corpus positions for a batch of query hashes.

        The LATERAL cap keeps a single ubiquitous hash from returning the whole
        table when the stoplist has not been refreshed yet.
        """
        if not hashes:
            return []

        clauses: list[str] = [
            f"NOT EXISTS (SELECT 1 FROM {_COMMON_TABLE} c WHERE c.hash = q.hash)",
        ]
        params: list[Any] = [hashes, max_postings_per_hash]

        if exclude_doc_ids:
            clauses.append("d.id <> ALL(%s::uuid[])")
            params.append(exclude_doc_ids)
        if exclude_submission_ids:
            clauses.append("(d.submission_id IS NULL OR d.submission_id <> ALL(%s::uuid[]))")
            params.append(exclude_submission_ids)
        if source_kinds:
            clauses.append("d.source_kind = ANY(%s)")
            params.append([str(kind) for kind in source_kinds])

        where_sql = " AND ".join(clauses)
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT f.doc_id::text, f.hash, f.word_pos
                    FROM unnest(%s::bigint[]) AS q(hash)
                    JOIN LATERAL (
                      SELECT doc_id, hash, word_pos
                      FROM {_FP_TABLE}
                      WHERE hash = q.hash
                      LIMIT %s
                    ) f ON true
                    JOIN {_DOC_TABLE} d ON d.id = f.doc_id
                    WHERE {where_sql}
                    """,
                    params,
                )
                rows = cur.fetchall()
        return [Posting(doc_id=str(r[0]), hash=int(r[1]), word_pos=int(r[2])) for r in rows]

    def get_documents(self, doc_ids: list[str], *, with_text: bool) -> dict[str, StoredDocument]:
        if not doc_ids:
            return {}
        text_column = "retained_text" if with_text else "NULL::text"
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT id::text, source_kind, source_ref, title, source_url,
                           submission_id::text, token_count, {text_column},
                           content_hash
                    FROM {_DOC_TABLE}
                    WHERE id = ANY(%s::uuid[])
                    """,
                    (doc_ids,),
                )
                rows = cur.fetchall()
        return {
            str(r[0]): StoredDocument(
                doc_id=str(r[0]),
                source_kind=SourceKind(r[1]),
                source_ref=r[2] or "",
                title=r[3] or "",
                source_url=r[4] or "",
                submission_id=r[5],
                token_count=int(r[6] or 0),
                retained_text=r[7],
                content_hash=r[8] or "",
            )
            for r in rows
        }

    def filter_common_hashes(self, hashes: list[int]) -> set[int]:
        """Subset of ``hashes`` that the stoplist marks as boilerplate."""
        if not hashes:
            return set()
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT hash FROM {_COMMON_TABLE} WHERE hash = ANY(%s::bigint[])",
                    (hashes,),
                )
                return {int(r[0]) for r in cur.fetchall()}

    def document_count(self) -> int:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"SELECT count(*) FROM {_DOC_TABLE}")
                row = cur.fetchone()
        return int(row[0]) if row else 0

    def stats(self) -> dict[str, Any]:
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT source_kind, count(*), coalesce(sum(token_count), 0)
                    FROM {_DOC_TABLE}
                    GROUP BY source_kind
                    ORDER BY source_kind
                    """,
                )
                by_kind = cur.fetchall()
                cur.execute(f"SELECT count(*) FROM {_FP_TABLE}")
                fp_row = cur.fetchone()
                cur.execute(f"SELECT count(*) FROM {_COMMON_TABLE}")
                common_row = cur.fetchone()
        return {
            "documents_by_kind": {
                str(r[0]): {"documents": int(r[1]), "tokens": int(r[2])} for r in by_kind
            },
            "fingerprints": int(fp_row[0]) if fp_row else 0,
            "common_hashes": int(common_row[0]) if common_row else 0,
        }

    # ----------------------------------------------------------- maintenance

    def refresh_common_hashes(self, *, doc_ratio: float, min_docs: int, min_doc_freq: int) -> int:
        """
        Rebuild the boilerplate stoplist.

        A hash appearing in more than ``doc_ratio`` of documents is journal
        template text, a standard formula, or a stock methods sentence. Below
        ``min_docs`` total documents the ratio is meaningless, so the stoplist is
        left empty and everything stays matchable.

        ``min_doc_freq`` is a hard floor on the threshold. Real copying shows up in
        two or three documents; without the floor a small corpus would compute a
        threshold of 2 and suppress precisely the evidence being looked for.
        """
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"SELECT count(*) FROM {_DOC_TABLE}")
                row = cur.fetchone()
                total = int(row[0]) if row else 0
                cur.execute(f"TRUNCATE {_COMMON_TABLE}")
                if total < min_docs:
                    conn.commit()
                    logger.info(
                        "Stoplist cleared: %d documents is below min_docs=%d",
                        total,
                        min_docs,
                    )
                    return 0

                threshold = max(min_doc_freq, round(total * doc_ratio))
                cur.execute(
                    f"""
                    INSERT INTO {_COMMON_TABLE} (hash, doc_freq)
                    SELECT hash, count(DISTINCT doc_id) AS doc_freq
                    FROM {_FP_TABLE}
                    GROUP BY hash
                    HAVING count(DISTINCT doc_id) >= %s
                    """,
                    (threshold,),
                )
                inserted = cur.rowcount
            conn.commit()
        logger.info(
            "Stoplist rebuilt: %d hashes appear in >= %d of %d documents",
            inserted,
            threshold,
            total,
        )
        return inserted
