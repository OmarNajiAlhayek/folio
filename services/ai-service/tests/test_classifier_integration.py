import os

import pytest

from app.config import Settings, get_settings
from app.ml.paths import resolve_arabert_model_path


def _weights_available() -> bool:
    try:
        resolve_arabert_model_path(Settings())
    except FileNotFoundError:
        return False
    return True


@pytest.mark.ml
@pytest.mark.skipif(
    os.environ.get("RUN_ML_TESTS") != "1",
    reason="Set RUN_ML_TESTS=1 to run ML tests",
)
@pytest.mark.skipif(not _weights_available(), reason="AraBERT weights not on disk")
def test_predict_abstract_only() -> None:
    pytest.importorskip("torch")
    pytest.importorskip("transformers")
    pytest.importorskip("arabert")

    get_settings.cache_clear()
    settings = Settings(arabert_enabled=True, arabert_idle_timeout_seconds=0)
    from app.ml.arabic_classifier import AdvancedArabicClassifier

    model_path = resolve_arabert_model_path(settings)
    classifier = AdvancedArabicClassifier(
        model_path=model_path,
        arabert_version=settings.arabert_preprocessor_model,
        idle_timeout_seconds=0,
        enable_idle_monitor=False,
    )

    abstract = (
        "تهدف هذه الدراسة إلى تحليل الأثر الاقتصادي للسياسات النقدية "
        "على النمو في الدول النامية."
    )
    probs = classifier.predict_abstract_only(abstract)
    assert probs
    top_label, top_conf = next(iter(probs.items()))
    assert isinstance(top_label, str)
    assert top_conf > 0
