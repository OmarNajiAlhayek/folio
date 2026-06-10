#!/usr/bin/env python3
"""Evaluate AraBERT discipline classifier on a labeled CSV and print/save confusion matrix."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))


def _predict_ids(classifier, df, threshold: float | None) -> tuple[list[int], list[int]]:
    actual_threshold = threshold if threshold is not None else classifier.default_threshold
    y_true: list[int] = []
    y_pred: list[int] = []

    for _, row in df.iterrows():
        probs = classifier.predict_full_article(
            str(row.get("title", "") or ""),
            str(row.get("keywords", "") or ""),
            str(row.get("abstract", "") or ""),
        )
        top_label = next(iter(probs))
        top_conf = next(iter(probs.values())) / 100.0
        pred_id = classifier.label2id[top_label]
        final_pred_id = (
            classifier.unspecified_id
            if (top_conf < actual_threshold and classifier.unspecified_id != -1)
            else pred_id
        )
        y_true.append(int(row["label"]))
        y_pred.append(int(final_pred_id))

    return y_true, y_pred


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--csv",
        type=Path,
        default=SERVICE_ROOT / "extracted_test_set.csv",
        help="Labeled test CSV (columns: title, abstract, keywords, label)",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=None,
        help="Confidence threshold for 'غير محدد' (default: classifier default, usually 0)",
    )
    parser.add_argument("--limit", type=int, default=None, help="Evaluate only first N rows")
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=SERVICE_ROOT / "eval_output",
        help="Directory for confusion_matrix.csv and optional PNG",
    )
    parser.add_argument("--no-plot", action="store_true", help="Skip heatmap PNG")
    args = parser.parse_args()

    try:
        from dotenv import load_dotenv

        load_dotenv(SERVICE_ROOT / ".env")
    except ImportError:
        pass

    try:
        import pandas as pd
        from sklearn.metrics import classification_report, confusion_matrix
    except ImportError:
        print("ERROR: pandas and scikit-learn required.", file=sys.stderr)
        return 1

    if not args.csv.is_file():
        print(f"ERROR: CSV not found: {args.csv}", file=sys.stderr)
        return 1

    from app.config import Settings
    from app.ml.arabic_classifier import AdvancedArabicClassifier
    from app.ml.paths import load_label_maps, resolve_arabert_model_path

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
            default_threshold=settings.arabert_default_threshold,
            idle_timeout_seconds=0,
            enable_idle_monitor=False,
        )
    except ImportError:
        print('ERROR: ML dependencies missing. Run: pip install -e ".[ml]"', file=sys.stderr)
        return 1

    df = pd.read_csv(args.csv).fillna("")
    if "label" not in df.columns:
        print("ERROR: CSV must include a 'label' column with integer class ids.", file=sys.stderr)
        return 1
    if args.limit:
        df = df.head(args.limit)

    print(f"Model: {model_path}")
    print(f"Device: {classifier.device}")
    print(f"Evaluating {len(df)} rows from {args.csv.name} ...")

    try:
        from tqdm import tqdm

        tqdm.pandas = lambda x: x  # noqa: ARG005
        iterator = tqdm(df.iterrows(), total=len(df), desc="predict")
        actual_threshold = (
            args.threshold if args.threshold is not None else classifier.default_threshold
        )
        y_true, y_pred = [], []
        for _, row in iterator:
            probs = classifier.predict_full_article(
                str(row.get("title", "") or ""),
                str(row.get("keywords", "") or ""),
                str(row.get("abstract", "") or ""),
            )
            top_label = next(iter(probs))
            top_conf = next(iter(probs.values())) / 100.0
            pred_id = classifier.label2id[top_label]
            final_pred_id = (
                classifier.unspecified_id
                if (top_conf < actual_threshold and classifier.unspecified_id != -1)
                else pred_id
            )
            y_true.append(int(row["label"]))
            y_pred.append(int(final_pred_id))
    except ImportError:
        y_true, y_pred = _predict_ids(classifier, df, args.threshold)

    id2label, _, labels_list = load_label_maps(model_path)
    label_ids = list(range(len(labels_list)))
    short_names = [f"{i}:{id2label[i][:12]}…" if len(id2label[i]) > 12 else f"{i}:{id2label[i]}" for i in label_ids]

    cm = confusion_matrix(y_true, y_pred, labels=label_ids)
    accuracy = (cm.trace() / cm.sum()) if cm.sum() else 0.0

    args.out_dir.mkdir(parents=True, exist_ok=True)
    cm_df = pd.DataFrame(cm, index=short_names, columns=short_names)
    cm_path = args.out_dir / "confusion_matrix.csv"
    cm_df.to_csv(cm_path, encoding="utf-8-sig")

    report = classification_report(
        y_true,
        y_pred,
        labels=label_ids,
        target_names=[id2label[i] for i in label_ids],
        zero_division=0,
    )
    metrics_path = args.out_dir / "classification_report.txt"
    metrics_path.write_text(report, encoding="utf-8")

    summary = {
        "n_samples": len(df),
        "accuracy": round(accuracy, 4),
        "model_path": str(model_path),
        "csv": str(args.csv.resolve()),
        "threshold": args.threshold if args.threshold is not None else classifier.default_threshold,
    }
    (args.out_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    print(f"\nAccuracy: {accuracy:.2%} ({cm.trace()}/{cm.sum()} correct)")
    print(f"\nConfusion matrix (rows=true, cols=pred):\n")
    print(cm_df.to_string())
    print(f"\n{classification_report(y_true, y_pred, labels=label_ids, zero_division=0)}")
    print(f"Saved: {cm_path}")
    print(f"Saved: {metrics_path}")

    if not args.no_plot:
        try:
            import matplotlib.pyplot as plt
            import seaborn as sns
        except ImportError:
            print("(Install matplotlib and seaborn for heatmap PNG; used --no-plot or skip.)")
            return 0

        fig, ax = plt.subplots(figsize=(14, 12))
        sns.heatmap(
            cm,
            annot=True,
            fmt="d",
            cmap="Blues",
            xticklabels=[id2label[i] for i in label_ids],
            yticklabels=[id2label[i] for i in label_ids],
            ax=ax,
        )
        ax.set_xlabel("Predicted")
        ax.set_ylabel("True")
        ax.set_title(f"AraBERT confusion matrix (n={len(df)}, acc={accuracy:.1%})")
        plt.xticks(rotation=45, ha="right")
        plt.yticks(rotation=0)
        plt.tight_layout()
        png_path = args.out_dir / "confusion_matrix.png"
        fig.savefig(png_path, dpi=150)
        plt.close(fig)
        print(f"Saved: {png_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
