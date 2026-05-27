from __future__ import annotations

import asyncio
import logging
import threading
from typing import TYPE_CHECKING, Any

from app.config import Settings
from app.ml.paths import arabert_model_config_exists, resolve_arabert_model_path

if TYPE_CHECKING:
    from app.ml.arabic_classifier import AdvancedArabicClassifier

logger = logging.getLogger(__name__)


class ClassifierDisabledError(RuntimeError):
    """Raised when AraBERT is disabled via configuration."""


class ClassifierUnavailableError(RuntimeError):
    """Raised when ML extras or model weights are missing."""


def probabilities_to_response(probs: dict[str, float]) -> dict[str, Any]:
    top_label = next(iter(probs))
    return {
        "top_label": top_label,
        "top_confidence": probs[top_label],
        "probabilities": probs,
    }


class ClassifierService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._classifier: AdvancedArabicClassifier | None = None
        self._model_path: str | None = None
        self._init_lock = threading.Lock()

    @property
    def enabled(self) -> bool:
        return self._settings.arabert_enabled

    def _require_enabled(self) -> None:
        if not self.enabled:
            raise ClassifierDisabledError("AraBERT classifier is disabled (ARABERT_ENABLED=false)")

    def _get_classifier(self) -> AdvancedArabicClassifier:
        self._require_enabled()
        if self._classifier is not None:
            return self._classifier

        with self._init_lock:
            if self._classifier is not None:
                return self._classifier

            try:
                from app.ml.arabic_classifier import AdvancedArabicClassifier
            except ImportError as err:
                raise ClassifierUnavailableError(
                    "ML dependencies are not installed. Run: pip install -e \".[ml]\"",
                ) from err

            try:
                model_path = resolve_arabert_model_path(self._settings)
            except FileNotFoundError as err:
                raise ClassifierUnavailableError(str(err)) from err

            self._model_path = str(model_path)
            self._classifier = AdvancedArabicClassifier(
                model_path=model_path,
                arabert_version=self._settings.arabert_preprocessor_model,
                default_threshold=self._settings.arabert_default_threshold,
                idle_timeout_seconds=self._settings.arabert_idle_timeout_seconds,
                enable_idle_monitor=True,
            )
            return self._classifier

    def warmup(self) -> None:
        """Load tokenizer + weights at startup so the first classify RPC is fast."""
        if not self.enabled or not self._settings.arabert_warmup_on_startup:
            return
        if not arabert_model_config_exists(self._settings):
            logger.warning("AraBERT warmup skipped: model weights not found on disk")
            return

        logger.info("Warming AraBERT classifier (tokenizer + weights)...")
        classifier = self._get_classifier()
        # Minimal Arabic text — triggers lazy weight load without a real manuscript.
        classifier.predict_abstract_only("اختبار")
        logger.info(
            "AraBERT warmup complete (device=%s, weights_loaded=%s)",
            classifier.device,
            classifier.weights_loaded,
        )

    def status(self) -> dict[str, Any]:
        if not self.enabled:
            return {
                "enabled": False,
                "model_path": None,
                "device": None,
                "labels_count": 0,
                "weights_loaded": False,
                "model_configured": False,
            }

        configured = arabert_model_config_exists(self._settings)
        path: str | None = None
        labels_count = 0
        device: str | None = None
        weights_loaded = False

        if configured:
            try:
                path = str(resolve_arabert_model_path(self._settings))
                from app.ml.paths import load_label_maps

                _, _, labels = load_label_maps(resolve_arabert_model_path(self._settings))
                labels_count = len(labels)
            except FileNotFoundError:
                configured = False

        if self._classifier is not None:
            device = self._classifier.device
            weights_loaded = self._classifier.weights_loaded
            labels_count = len(self._classifier.labels_list)
            path = self._model_path

        return {
            "enabled": True,
            "model_path": path,
            "device": device,
            "labels_count": labels_count,
            "weights_loaded": weights_loaded,
            "model_configured": configured,
        }

    def labels(self) -> list[str]:
        classifier = self._get_classifier()
        return list(classifier.labels_list)

    async def classify_abstract(self, abstract: str) -> dict[str, Any]:
        classifier = self._get_classifier()
        probs = await asyncio.to_thread(classifier.predict_abstract_only, abstract)
        return probabilities_to_response(probs)

    async def classify_article(
        self,
        title: str,
        keywords: str,
        abstract: str,
    ) -> dict[str, Any]:
        classifier = self._get_classifier()
        probs = await asyncio.to_thread(
            classifier.predict_full_article,
            title,
            keywords,
            abstract,
        )
        return probabilities_to_response(probs)
