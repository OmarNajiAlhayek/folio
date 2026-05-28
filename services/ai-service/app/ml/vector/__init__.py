"""
Vector search package for Similar Articles, Semantic Search, and Plagiarism Detection.

Requires optional dependencies: pip install -e ".[similarity]"
"""

from app.ml.vector.ai_engine import AIEngine, similarity_from_distance
from app.ml.vector.article_ingestion_service import ArticleIngestionService
from app.ml.vector.config import (
    CHUNKS_COLLECTION_NAME,
    REVIEWER_HISTORY_COLLECTION_NAME,
    REVIEWERS_COLLECTION_NAME,
    SUMMARY_COLLECTION_NAME,
    VectorConfig,
)
from app.ml.vector.reviewer_ingestion_service import ReviewerIngestionService
from app.ml.vector.reviewer_matching_service import ReviewerMatchingService
from app.ml.vector.scoring import (
    cosine_similarity,
    mean_scores_by_reviewer,
    normalize_cross_encoder_score,
)
from app.ml.vector.plagiarism_service import PlagiarismService
from app.ml.vector.search_service import SearchService
from app.ml.vector.similarity_service import SimilarArticlesService
from app.ml.vector.text_processing import (
    chunk_id,
    chunk_text,
    clean_text,
    combine_summary_text,
)
from app.ml.vector.text_processing import reviewer_history_id
from app.ml.vector.types import (
    ArticleNotIndexedError,
    IngestResult,
    PlagiarismMatch,
    ReviewerSuggestionHit,
    SearchHit,
    SimilarArticleHit,
    VectorDependenciesError,
)

__all__ = [
    "AIEngine",
    "ArticleIngestionService",
    "ArticleNotIndexedError",
    "CHUNKS_COLLECTION_NAME",
    "IngestResult",
    "PlagiarismMatch",
    "PlagiarismService",
    "REVIEWER_HISTORY_COLLECTION_NAME",
    "REVIEWERS_COLLECTION_NAME",
    "ReviewerIngestionService",
    "ReviewerMatchingService",
    "ReviewerSuggestionHit",
    "SearchHit",
    "SearchService",
    "SimilarArticleHit",
    "SimilarArticlesService",
    "SUMMARY_COLLECTION_NAME",
    "VectorConfig",
    "VectorDependenciesError",
    "chunk_id",
    "chunk_text",
    "clean_text",
    "combine_summary_text",
    "cosine_similarity",
    "mean_scores_by_reviewer",
    "normalize_cross_encoder_score",
    "reviewer_history_id",
    "similarity_from_distance",
]
