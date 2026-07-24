"""AraBERT mean-pooled embeddings for cosine similarity (0–100 scale)."""

from __future__ import annotations

import logging
import threading

import torch
from transformers import AutoModel, AutoTokenizer

logger = logging.getLogger(__name__)

_MODEL_NAME = "aubmindlab/bert-base-arabertv02"


class AraBertEmbedder:
    _instance: AraBertEmbedder | None = None
    _lock = threading.Lock()

    def __init__(self) -> None:
        self._tokenizer = AutoTokenizer.from_pretrained(_MODEL_NAME)
        self._model = AutoModel.from_pretrained(_MODEL_NAME)
        self._model.eval()

    @classmethod
    def get_instance(cls) -> AraBertEmbedder:
        if cls._instance is not None:
            return cls._instance
        with cls._lock:
            if cls._instance is None:
                logger.info("Loading AraBERT embedder for web similarity")
                cls._instance = cls()
            return cls._instance

    def embed_text(self, text: str) -> torch.Tensor:
        inputs = self._tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
            padding=True,
            max_length=512,
        )
        with torch.no_grad():
            outputs = self._model(**inputs)
        return outputs.last_hidden_state.mean(dim=1)

    def cosine_sim(self, text1: str, text2: str) -> float:
        embedding1 = self.embed_text(text1)
        embedding2 = self.embed_text(text2)
        similarity = torch.nn.functional.cosine_similarity(embedding1, embedding2).item()
        return similarity * 100.0
