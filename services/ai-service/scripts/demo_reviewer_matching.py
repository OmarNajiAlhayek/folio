#!/usr/bin/env python3
"""Manual smoke demo for reviewer matching (requires similarity extras)."""

from __future__ import annotations

from app.ml.vector.config import VectorConfig
from app.ml.vector.reviewer_ingestion_service import ReviewerIngestionService
from app.ml.vector.reviewer_matching_service import ReviewerMatchingService


def main() -> None:
    config = VectorConfig()
    ingest = ReviewerIngestionService(config=config)
    match = ReviewerMatchingService(config=config)

    ingest.upsert_reviewer(
        "reviewer-ar",
        "الذكاء الاصطناعي تعلم الآلة [KEYWORDS] NLP",
        display_name="أحمد",
    )
    ingest.upsert_reviewer(
        "reviewer-en",
        "medieval history archives [KEYWORDS] manuscripts",
        display_name="Jane",
    )
    ingest.upsert_reviewer(
        "reviewer-mix",
        "computational linguistics [KEYWORDS] Arabic NLP",
        display_name="Sara",
    )

    ingest.upsert_review_history(
        "reviewer-mix",
        "sub-1",
        "Deep learning for Arabic text classification",
        "NLP, deep learning",
    )

    query = "تعلم الآلة ومعالجة اللغات الطبيعية"
    hits = match.suggest_reviewers(query, limit=3)

    print(f"Query: {query}\n")
    for i, hit in enumerate(hits, 1):
        print(
            f"{i}. {hit.reviewer_id} final={hit.final_score:.4f} "
            f"bio={hit.bio_score:.4f} hist={hit.history_score:.4f} "
            f"ce_bio={hit.ce_bio_score} ce_hist={hit.ce_history_score}",
        )


if __name__ == "__main__":
    main()
