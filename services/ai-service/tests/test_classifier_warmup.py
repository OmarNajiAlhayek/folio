from unittest.mock import MagicMock, patch

from app.config import Settings
from app.services.classifier_service import ClassifierService


def test_warmup_skips_when_disabled() -> None:
    service = ClassifierService(Settings(arabert_enabled=False))
    with patch.object(service, "_get_classifier") as get_classifier:
        service.warmup()
        get_classifier.assert_not_called()


def test_warmup_skips_when_flag_off() -> None:
    service = ClassifierService(
        Settings(arabert_enabled=True, arabert_warmup_on_startup=False),
    )
    with patch.object(service, "_get_classifier") as get_classifier:
        service.warmup()
        get_classifier.assert_not_called()


def test_warmup_runs_dummy_predict_when_configured() -> None:
    service = ClassifierService(
        Settings(arabert_enabled=True, arabert_warmup_on_startup=True),
    )
    mock_classifier = MagicMock()
    mock_classifier.device = "cpu"
    mock_classifier.weights_loaded = True
    with (
        patch(
            "app.services.classifier_service.arabert_model_config_exists",
            return_value=True,
        ),
        patch.object(service, "_get_classifier", return_value=mock_classifier),
    ):
        service.warmup()
    mock_classifier.predict_abstract_only.assert_called_once_with("اختبار")
