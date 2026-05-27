#!/usr/bin/env python3
"""Smoke-test AraBERT discipline classifier (requires `.[ml]` and local weights)."""

from __future__ import annotations

import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))


def main() -> int:
    try:
        from dotenv import load_dotenv

        load_dotenv(SERVICE_ROOT / ".env")
    except ImportError:
        pass

    from app.config import Settings
    from app.ml.arabic_classifier import AdvancedArabicClassifier
    from app.ml.paths import resolve_arabert_model_path

    settings = Settings(arabert_enabled=True)
    try:
        model_path = resolve_arabert_model_path(settings)
    except FileNotFoundError as err:
        print(f"ERROR: {err}", file=sys.stderr)
        return 1

    try:
        classifier = AdvancedArabicClassifier(
            model_path=model_path,
            arabert_version=settings.arabert_preprocessor_model,
            idle_timeout_seconds=settings.arabert_idle_timeout_seconds,
            enable_idle_monitor=False,
        )
    except ImportError:
        print(
            "ERROR: ML dependencies missing. Run: pip install -e \".[ml]\"",
            file=sys.stderr,
        )
        return 1

    abstract = (
        "تهدف هذه الدراسة إلى تحليل الأثر الاقتصادي للسياسات النقدية "
        "على النمو في الدول النامية."
    )
    probs = classifier.predict_abstract_only(abstract)
    top_label, top_conf = next(iter(probs.items()))
    print(f"Model: {model_path}")
    print(f"Top label: {top_label} ({top_conf}%)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
