from pathlib import Path

import pytest

from app.config import Settings
from app.ml.paths import SERVICE_ROOT, resolve_arabert_model_path


@pytest.mark.skipif(
    not (SERVICE_ROOT / "arabert_clean_model_FINAL-20260525T161953Z-3-001").exists(),
    reason="Local AraBERT weights not present",
)
def test_resolve_nested_default_weights() -> None:
    settings = Settings(arabert_model_path="")
    path = resolve_arabert_model_path(settings)
    assert path.is_dir()
    assert (path / "config.json").is_file()


def test_resolve_explicit_override(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("ARABERT_MODEL_PATH", raising=False)
    config = tmp_path / "config.json"
    config.write_text('{"id2label": {"0": "a"}, "label2id": {"a": 0}}', encoding="utf-8")
    settings = Settings(arabert_model_path=str(tmp_path))
    assert resolve_arabert_model_path(settings) == tmp_path.resolve()


def test_resolve_missing_raises(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ARABERT_MODEL_PATH", raising=False)
    empty = tmp_path / "empty"
    empty.mkdir()
    settings = Settings(arabert_model_path=str(empty))
    with pytest.raises(FileNotFoundError, match="config.json"):
        resolve_arabert_model_path(settings)
