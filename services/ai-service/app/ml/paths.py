from __future__ import annotations

import json
from pathlib import Path

from app.config import Settings

SERVICE_ROOT = Path(__file__).resolve().parents[2]

_NESTED_DEFAULT = (
    SERVICE_ROOT
    / "arabert_clean_model_FINAL-20260525T161953Z-3-001"
    / "arabert_clean_model_FINAL"
)
_FUTURE_DEFAULT = SERVICE_ROOT / "models" / "arabert_clean_model_FINAL"


def resolve_arabert_model_path(settings: Settings) -> Path:
    """Resolve fine-tuned AraBERT weights directory (must contain config.json)."""
    if settings.arabert_model_path.strip():
        raw = Path(settings.arabert_model_path.strip())
        explicit = raw if raw.is_absolute() else SERVICE_ROOT / raw
        if (explicit / "config.json").is_file():
            return explicit.resolve()
        raise FileNotFoundError(
            f"AraBERT model not found at ARABERT_MODEL_PATH ({explicit}); config.json missing.",
        )

    candidates = [_NESTED_DEFAULT, _FUTURE_DEFAULT]
    for path in candidates:
        if (path / "config.json").is_file():
            return path.resolve()

    searched = ", ".join(str(p) for p in candidates)
    raise FileNotFoundError(
        f"AraBERT model not found (config.json missing). Searched: {searched}. "
        "Set ARABERT_MODEL_PATH or place weights under the nested export folder.",
    )


def arabert_model_config_exists(settings: Settings) -> bool:
    try:
        resolve_arabert_model_path(settings)
    except FileNotFoundError:
        return False
    return True


def load_label_maps(model_dir: Path) -> tuple[dict[int | str, str], dict[str, int], list[str]]:
    config_path = model_dir / "config.json"
    with config_path.open(encoding="utf-8") as handle:
        config = json.load(handle)

    id2label_raw: dict[str, str] = config["id2label"]
    label2id: dict[str, int] = config["label2id"]
    id2label: dict[int | str, str] = {
        int(key) if str(key).isdigit() else key: value for key, value in id2label_raw.items()
    }
    labels_list = [
        id2label[i] if i in id2label else id2label[str(i)] for i in range(len(id2label_raw))
    ]
    return id2label, label2id, labels_list
