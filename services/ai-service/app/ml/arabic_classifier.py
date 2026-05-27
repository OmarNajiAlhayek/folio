from __future__ import annotations

import gc
import logging
import threading
import time
from pathlib import Path
from typing import Any

from app.ml.paths import load_label_maps

logger = logging.getLogger(__name__)


class AdvancedArabicClassifier:
    """Arabic discipline classifier (AraBERT fine-tuned sequence classification)."""

    def __init__(
        self,
        model_path: str | Path,
        arabert_version: str = "aubmindlab/bert-base-arabertv02",
        default_threshold: float = 0.0,
        idle_timeout_seconds: int = 300,
        *,
        enable_idle_monitor: bool = True,
    ) -> None:
        self.model_path = str(model_path)
        self.device = "cuda" if self._torch_cuda_available() else "cpu"
        self.default_threshold = default_threshold
        self.idle_timeout = idle_timeout_seconds
        self.last_used = time.time()
        self.is_busy = False
        self.model = None
        self._inference_lock = threading.Lock()

        logger.info("Loading tokenizer and AraBERT preprocessor from %s", self.model_path)
        from arabert.preprocess import ArabertPreprocessor
        from transformers import AutoTokenizer

        self.tokenizer = AutoTokenizer.from_pretrained(self.model_path)
        self.arabert_prep = ArabertPreprocessor(model_name=arabert_version)

        self.id2label, self.label2id, self.labels_list = load_label_maps(Path(self.model_path))
        self.unspecified_id = self.label2id.get("غير محدد", -1)

        logger.info(
            "Classifier ready on %s (%d labels, idle_timeout=%ss)",
            self.device.upper(),
            len(self.labels_list),
            self.idle_timeout,
        )

        if self.idle_timeout > 0 and enable_idle_monitor:
            self._start_memory_monitor()

    @staticmethod
    def _torch_cuda_available() -> bool:
        import torch

        return torch.cuda.is_available()

    @property
    def weights_loaded(self) -> bool:
        return self.model is not None

    def _label_name(self, index: int) -> str:
        if index in self.id2label:
            return self.id2label[index]
        return self.id2label[str(index)]

    def _load_model(self) -> None:
        if self.model is None:
            logger.info("Loading sequence classification weights into %s", self.device)
            from transformers import AutoModelForSequenceClassification

            self.model = AutoModelForSequenceClassification.from_pretrained(self.model_path).to(
                self.device,
            )
            self.model.eval()
        self.last_used = time.time()

    def _unload_model(self) -> None:
        if self.model is not None:
            logger.info("Unloading idle model weights to free memory")
            del self.model
            self.model = None
            gc.collect()
            if self._torch_cuda_available():
                import torch

                torch.cuda.empty_cache()

    def _start_memory_monitor(self) -> None:
        def monitor_loop() -> None:
            while True:
                time.sleep(5)
                with self._inference_lock:
                    idle = (time.time() - self.last_used) > self.idle_timeout
                    if idle and not self.is_busy and self.model is not None:
                        self._unload_model()

        thread = threading.Thread(target=monitor_loop, daemon=True)
        thread.start()

    def _ensure_ready(self) -> None:
        self._load_model()
        self.is_busy = True

    def _finish_task(self) -> None:
        self.is_busy = False
        self.last_used = time.time()

    def _get_threshold(self, custom_threshold: float | None) -> float:
        return custom_threshold if custom_threshold is not None else self.default_threshold

    def _prepare_text(self, title: str = "", keywords: str = "", abstract: str = "") -> str:
        t_prep = self.arabert_prep.preprocess(str(title).strip()) if title else ""
        k_prep = self.arabert_prep.preprocess(str(keywords).strip()) if keywords else ""
        a_prep = self.arabert_prep.preprocess(str(abstract).strip()) if abstract else ""
        return f"{t_prep} {self.tokenizer.sep_token} {k_prep} {self.tokenizer.sep_token} {a_prep}"

    def predict_proba(self, text: str) -> dict[str, float]:
        import torch
        import torch.nn.functional as F

        with self._inference_lock:
            self._ensure_ready()
            try:
                inputs = self.tokenizer(
                    text,
                    return_tensors="pt",
                    truncation=True,
                    max_length=512,
                ).to(self.device)
                with torch.no_grad():
                    logits = self.model(**inputs).logits
                    probs = F.softmax(logits, dim=1).squeeze().tolist()

                if isinstance(probs, float):
                    probs = [probs]

                results = {
                    self._label_name(i): round(prob * 100, 2) for i, prob in enumerate(probs)
                }
                return dict(sorted(results.items(), key=lambda item: item[1], reverse=True))
            finally:
                self._finish_task()

    def predict_abstract_only(self, abstract: str) -> dict[str, float]:
        if not abstract.strip():
            raise ValueError("Abstract must not be empty")
        return self.predict_proba(self._prepare_text(abstract=abstract))

    def predict_full_article(
        self,
        title: str,
        keywords: str,
        abstract: str,
    ) -> dict[str, float]:
        return self.predict_proba(
            self._prepare_text(title=title, keywords=keywords, abstract=abstract),
        )

    def analyze_article_batch(
        self,
        articles: list[dict[str, str]],
        threshold: float | None = None,
        *,
        show_progress: bool = False,
    ) -> dict[str, Any]:
        if not articles:
            return {"error": "Article list is empty."}

        actual_threshold = self._get_threshold(threshold)
        logger.info(
            "Batch analysis: %d articles (threshold=%s)",
            len(articles),
            actual_threshold,
        )

        iterator: Any = articles
        if show_progress:
            from tqdm import tqdm

            iterator = tqdm(articles)

        class_prob_sums = {label: 0.0 for label in self.labels_list}
        individual_predictions: list[dict[str, Any]] = []

        for article in iterator:
            title = article.get("title", "")
            keywords = article.get("keywords", "")
            abstract = article.get("abstract", "")

            probs_dict = self.predict_full_article(
                title=title,
                keywords=keywords,
                abstract=abstract,
            )

            top_label = next(iter(probs_dict))
            top_confidence = probs_dict[top_label]

            if (top_confidence / 100.0) < actual_threshold and self.unspecified_id != -1:
                final_label = "غير محدد"
            else:
                final_label = top_label

            individual_predictions.append(
                {
                    "final_prediction": final_label,
                    "original_top": top_label,
                    "confidence": top_confidence,
                    "all_probabilities": probs_dict,
                },
            )

            for label, prob in probs_dict.items():
                class_prob_sums[label] += prob

        avg_probs = {
            label: round(total / len(articles), 2) for label, total in class_prob_sums.items()
        }
        avg_probs_sorted = dict(sorted(avg_probs.items(), key=lambda item: item[1], reverse=True))

        return {
            "total_articles_analyzed": len(articles),
            "applied_threshold": actual_threshold,
            "average_confidence_per_class": avg_probs_sorted,
            "overall_dominant_class": next(iter(avg_probs_sorted)),
            "individual_results": individual_predictions,
        }
