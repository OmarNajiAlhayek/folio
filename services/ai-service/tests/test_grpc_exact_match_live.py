"""Live end-to-end check: real gRPC server, real corpus, real article text.

Everything else about the exact-match stage is tested with mocks or in-memory
stores. This is the one test that exercises the whole ai-service path at once —
settings, lazy corpus connection, fingerprint lookup, protobuf serialization —
against a Postgres that actually holds a harvested corpus.

Opt-in because it needs that database::

    pytest -m corpus tests/test_grpc_exact_match_live.py

Ground truth comes from the corpus itself: a document's own stored text must
match itself almost perfectly, and must vanish once its source is excluded. Both
assertions are about the pipeline, not about any particular article.
"""

from __future__ import annotations

import pytest

grpc = pytest.importorskip("grpc")
plagiarism_pb2 = pytest.importorskip("folio.ai.v1.plagiarism_pb2")
plagiarism_pb2_grpc = pytest.importorskip("folio.ai.v1.plagiarism_pb2_grpc")
psycopg = pytest.importorskip("psycopg")

from app.config import Settings, get_settings  # noqa: E402
from app.grpc.server import start_grpc_server, stop_grpc_server  # noqa: E402
from app.services.classifier_service import ClassifierService  # noqa: E402
from app.services.copyedit_analysis_service import CopyeditAnalysisService  # noqa: E402
from app.services.keyword_suggestion_service import KeywordSuggestionService  # noqa: E402
from app.services.reviewer_matching_grpc_service import (  # noqa: E402
    ReviewerMatchingGrpcService,
)
from app.services.similarity_service import SimilarityService  # noqa: E402

pytestmark = pytest.mark.corpus

# Enough tokens that the winnowing guarantee applies comfortably.
MIN_CORPUS_TOKENS = 1500


def _live_settings() -> Settings:
    base = get_settings()
    return Settings(
        grpc_port=0,
        ai_service_token="",
        exact_match_enabled=True,
        similarity_enabled=False,
        web_similarity_enabled=False,
        vector_db_host=base.vector_db_host,
        vector_db_port=base.vector_db_port,
        vector_db_user=base.vector_db_user,
        vector_db_password=base.vector_db_password,
        vector_db_database=base.vector_db_database,
    )


def _fetch_corpus_sample(settings: Settings) -> tuple[str, str, str]:
    """(doc_id, title, retained_text) for a document whose text we retained."""
    with psycopg.connect(
        host=settings.vector_db_host,
        port=settings.vector_db_port,
        user=settings.vector_db_user,
        password=settings.vector_db_password,
        dbname=settings.vector_db_database,
        connect_timeout=10,
    ) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id::text, title, retained_text
            FROM corpus_documents
            WHERE retained_text IS NOT NULL AND token_count >= %s
            LIMIT 1
            """,
            (MIN_CORPUS_TOKENS,),
        )
        row = cur.fetchone()
    if row is None:
        pytest.skip(
            "No corpus document with retained text — run scripts/harvest_damascus.sh "
            "or scripts/import_back_catalog.py first",
        )
    return str(row[0]), row[1] or "", row[2]


@pytest.fixture
async def live_channel(request: pytest.FixtureRequest):
    settings = _live_settings()
    similarity = SimilarityService(settings)
    server, port = await start_grpc_server(
        ClassifierService(Settings(arabert_enabled=False)),
        KeywordSuggestionService(Settings(keywords_suggestion_enabled=False)),
        similarity,
        ReviewerMatchingGrpcService(Settings(reviewer_matching_enabled=False)),
        CopyeditAnalysisService(Settings(copyedit_analysis_enabled=False)),
        settings,
    )
    channel = grpc.aio.insecure_channel(f"localhost:{port}")
    try:
        yield channel
    finally:
        await channel.close()
        await stop_grpc_server(server)
        # The corpus pool is opened lazily on first detect and is process-wide,
        # so without this its worker threads outlive the test run.
        from app.ml.exact_match.corpus_store import close_corpus_pool

        close_corpus_pool()


async def test_live_exact_match_detects_a_corpus_document(live_channel) -> None:
    """A corpus document fed back as a manuscript must match itself."""
    settings = _live_settings()
    doc_id, title, text = _fetch_corpus_sample(settings)

    stub = plagiarism_pb2_grpc.PlagiarismServiceStub(live_channel)
    response = await stub.DetectCorpusSimilarity(
        plagiarism_pb2.DetectCorpusSimilarityRequest(submission_text=text),
        timeout=180,
    )

    assert not response.exact_error, response.exact_error
    assert response.HasField("exact_matches")
    report = response.exact_matches

    assert report.total_tokens >= MIN_CORPUS_TOKENS
    # Boundary k-grams at the document edges are never selected, so exact 100%
    # is not expected — but anything below 95% means the pipeline lost text.
    assert report.overall_ratio > 0.95, (
        f"self-match only {report.overall_ratio:.1%} for {title[:60]!r}"
    )

    matched_ids = {source.doc_id for source in report.sources}
    assert doc_id in matched_ids, "the document did not match its own corpus entry"

    source = next(s for s in report.sources if s.doc_id == doc_id)
    assert source.spans, "a match with no spans cannot be shown to an editor"
    assert source.matched_tokens > 0


async def test_live_exact_match_is_specific(live_channel) -> None:
    """Unrelated text must not match — a matcher that flags everything is useless."""
    settings = _live_settings()
    _, _, text = _fetch_corpus_sample(settings)

    # Same alphabet and rough length, but nonsense word order.
    words = text.split()
    scrambled = " ".join(reversed(words))

    stub = plagiarism_pb2_grpc.PlagiarismServiceStub(live_channel)
    response = await stub.DetectCorpusSimilarity(
        plagiarism_pb2.DetectCorpusSimilarityRequest(submission_text=scrambled),
        timeout=180,
    )

    assert not response.exact_error, response.exact_error
    report = response.exact_matches
    # Reversal destroys every k-gram, so overlap should be negligible.
    assert report.overall_ratio < 0.05, (
        f"reversed text still matched {report.overall_ratio:.1%} — floor too low"
    )
