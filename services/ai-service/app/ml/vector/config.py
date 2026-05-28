"""Configuration for the vector search package."""

from __future__ import annotations

from dataclasses import dataclass

SUMMARY_COLLECTION_NAME = "articles_summary_collection"
CHUNKS_COLLECTION_NAME = "articles_chunks_collection"
REVIEWERS_COLLECTION_NAME = "reviewers_collection"
REVIEWER_HISTORY_COLLECTION_NAME = "reviewer_history_summary_collection"


def _detect_device() -> str:
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if torch.backends.mps.is_available():
            return "mps"
    except ImportError:
        pass
    return "cpu"


@dataclass(frozen=True)
class VectorConfig:
    """Runtime configuration for Chroma, encoders, and chunking."""

    chroma_path: str = "./data/chroma_articles"
    bi_encoder_model: str = "sentence-transformers/paraphrase-multilingual-mpnet-base-v2"
    cross_encoder_model: str = "cross-encoder/stsb-distilroberta-base"
    device: str | None = None
    batch_size: int = 32
    chunk_size_words: int = 200
    chunk_overlap_words: int = 50
    plagiarism_threshold: float = 0.85
    search_n_results_per_chunk: int = 5
    reviewer_bio_weight: float = 0.4
    reviewer_history_weight: float = 0.6
    reviewer_rerank_top_k: int = 15
    reviewer_default_limit: int = 5

    def resolved_device(self) -> str:
        return self.device if self.device is not None else _detect_device()
