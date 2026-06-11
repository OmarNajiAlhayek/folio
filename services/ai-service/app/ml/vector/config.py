"""Configuration for the vector search package."""

from __future__ import annotations

from dataclasses import dataclass

# paraphrase-multilingual-mpnet-base-v2 output dimension; must match migration vector(n).
EMBEDDING_DIM = 768


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
    """Runtime configuration for pgvector storage, encoders, and chunking."""

    vector_db_host: str = "localhost"
    vector_db_port: int = 5432
    vector_db_user: str = "postgres"
    vector_db_password: str = ""
    vector_db_database: str = "folio_review"
    vector_db_ssl: bool = False
    vector_db_hnsw_ef_search: int = 64
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
