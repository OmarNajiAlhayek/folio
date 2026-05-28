#!/usr/bin/env python3
"""Smoke demo for app.ml.vector (ingest, similar, search, plagiarism)."""

from __future__ import annotations

import logging
import sys
from pathlib import Path

# Allow running from repo: python scripts/demo_vector.py
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ml.vector import (  # noqa: E402
    AIEngine,
    ArticleIngestionService,
    PlagiarismService,
    SearchService,
    SimilarArticlesService,
    VectorConfig,
)

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)

SAMPLE_ARTICLES = [
    {
        "id": "art_1",
        "abstract": "الذكاء الاصطناعي يغير مستقبل البرمجة بشكل جذري.",
        "keywords": "تقنية, ذكاء اصطناعي",
        "category": "technology",
        "full_text": (
            "الذكاء الاصطناعي يغير مستقبل البرمجة بشكل جذري. "
            "تعلم الآلة والشبكات العصبية أصبحت أساسية في تطوير البرمجيات الحديثة. "
            "المبرمجون يستخدمون نماذج لغوية كبيرة لزيادة الإنتاجية."
        ),
    },
    {
        "id": "art_2",
        "abstract": "تعلم لغة بايثون يعتبر خطوة أساسية للمبتدئين في البرمجة.",
        "keywords": "برمجة, بايثون",
        "category": "technology",
        "full_text": (
            "تعلم لغة بايثون يعتبر خطوة أساسية للمبتدئين في البرمجة. "
            "بايثون لغة سهلة القراءة ومناسبة للذكاء الاصطناعي وتحليل البيانات."
        ),
    },
    {
        "id": "art_3",
        "abstract": "فوائد ممارسة الرياضة الصباحية على الصحة النفسية.",
        "keywords": "رياضة, صحة",
        "category": "health",
        "full_text": (
            "فوائد ممارسة الرياضة الصباحية على الصحة النفسية كبيرة. "
            "المشي اليومي يقلل التوتر ويحسن المزاج."
        ),
    },
]


def main() -> None:
    config = VectorConfig(
        chroma_path="./data/demo_chroma_articles",
        device="cpu",
    )
    AIEngine.reset_instance()
    engine = AIEngine.get_instance(config)

    ingestion = ArticleIngestionService(engine=engine, config=config)
    similar_svc = SimilarArticlesService(engine=engine, config=config)
    search_svc = SearchService(engine=engine, config=config)
    plagiarism_svc = PlagiarismService(engine=engine, config=config)

    logger.info("--- Ingesting sample articles ---")
    for art in SAMPLE_ARTICLES:
        result = ingestion.ingest_published_article(
            art["id"],
            art["abstract"],
            art["keywords"],
            art["full_text"],
            category=art["category"],
        )
        logger.info("  %s -> %s chunks", result.article_id, result.chunks_indexed)

    logger.info("--- Similar articles for art_1 ---")
    for hit in similar_svc.find_similar("art_1", limit=3, similarity_threshold=0.3):
        logger.info(
            "  %.4f %s | %s",
            hit.similarity,
            hit.article_id,
            hit.abstract[:60],
        )

    logger.info("--- Semantic search: 'ذكاء اصطناعي برمجة' ---")
    for hit in search_svc.search("ذكاء اصطناعي برمجة", limit_articles=3):
        logger.info("  %.4f %s | %s...", hit.score, hit.article_id, hit.snippet[:50])

    logger.info("--- Plagiarism check (copied art_1 paragraph) ---")
    submission = SAMPLE_ARTICLES[0]["full_text"]
    matches = plagiarism_svc.detect(submission, threshold=0.85)
    if not matches:
        logger.info("  No matches above threshold")
    for m in matches[:5]:
        logger.info(
            "  chunk %s -> %s chunk %s | %.4f",
            m.submission_chunk_index,
            m.source_article_id,
            m.source_chunk_index,
            m.similarity,
        )


if __name__ == "__main__":
    main()
