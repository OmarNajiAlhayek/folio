"""Benchmark every installed OCR engine on real PDFs from this corpus.

Answers "is engine X good enough?" with a number instead of a discussion. The
metric is the same gate the importers use: function-word frequency, where real
text scores 0.11-0.13 and broken extraction scores 0.006-0.029. An engine that
does not clear roughly 0.09 is not worth its runtime.

Accuracy matters more than it would for search, because exact matching needs
whole k-grams: at word error rate ``p`` a k-gram survives with probability
``(1-p)^k``, so at k=6 a 5% error rate keeps 74% of fingerprints and 15% keeps 38%.

Usage::

    python scripts/ocr_bench.py ../../Damascus_Articles --pages 3
    python scripts/ocr_bench.py <dir-or-file> --pages 4 --only-broken
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.ml.exact_match.ocr import available_engines, ocr_pdf_bytes  # noqa: E402
from app.ml.exact_match.text_extract import extract_pdf_bytes  # noqa: E402
from app.ml.exact_match.text_quality import TextQuality, assess_text  # noqa: E402

logger = logging.getLogger("ocr_bench")

# Real text lands here; anything well below is not usable for exact matching.
GOOD_ENOUGH = 0.09


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("target", type=Path, help="PDF file or directory of PDFs")
    parser.add_argument("--pages", type=int, default=3, help="Pages per file to OCR")
    parser.add_argument("--limit", type=int, default=4, help="Files to test")
    parser.add_argument(
        "--only-broken",
        action="store_true",
        help="Test only files whose text layer already fails the gate",
    )
    parser.add_argument("--dpi", type=int, default=300)
    parser.add_argument("--lang", default="ara+eng")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    files = (
        [args.target]
        if args.target.is_file()
        else sorted(p for p in args.target.rglob("*.pdf") if p.is_file())
    )
    if not files:
        logger.error("No PDFs under %s", args.target)
        return 1

    engines = available_engines()
    if not engines:
        logger.error("No OCR engine installed. Try: pip install surya-ocr  (or pytesseract)")
        return 1
    logger.info("Engines: %s", ", ".join(e.name for e in engines))
    logger.info("Metric: function-word ratio (real text 0.11-0.13, broken <0.03)\n")

    selected: list[tuple[Path, bytes, float]] = []
    for path in files:
        if len(selected) >= args.limit:
            break
        data = path.read_bytes()
        try:
            layer = assess_text(extract_pdf_bytes(data).text)
        except Exception as exc:
            logger.info("skip %s (%s)", path.name, exc)
            continue
        if args.only_broken and layer.quality is not TextQuality.BROKEN:
            continue
        selected.append((path, data, layer.function_word_ratio))

    if not selected:
        logger.error("No files matched the selection")
        return 1

    header = f"{'file':<30}{'text-layer':>12}" + "".join(f"{e.name:>20}" for e in engines)
    logger.info(header)
    logger.info("-" * len(header))

    totals: dict[str, list[float]] = {e.name: [] for e in engines}
    seconds: dict[str, list[float]] = {e.name: [] for e in engines}

    for path, data, layer_score in selected:
        cells: list[str] = []
        for engine in engines:
            try:
                started = time.time()
                result = ocr_pdf_bytes(
                    data,
                    engine=engine,
                    lang=args.lang,
                    dpi=args.dpi,
                    max_pages=args.pages,
                )
                elapsed = time.time() - started
                score = assess_text(result.text).function_word_ratio
                per_page = elapsed / max(1, min(args.pages, result.page_count))
                totals[engine.name].append(score)
                seconds[engine.name].append(per_page)
                cells.append(f"{score:.3f} ({per_page:.1f}s/pg)")
            except Exception as exc:
                cells.append(f"ERR {type(exc).__name__}")
        logger.info(
            f"{path.name[:28]:<30}{layer_score:>12.3f}" + "".join(f"{c:>20}" for c in cells),
        )

    logger.info("-" * len(header))
    logger.info("\nVerdict:")
    for engine in engines:
        scores = totals[engine.name]
        if not scores:
            logger.info("  %-10s no successful runs", engine.name)
            continue
        mean = sum(scores) / len(scores)
        pace = sum(seconds[engine.name]) / len(seconds[engine.name])
        status = "usable" if mean >= GOOD_ENOUGH else "BELOW THRESHOLD"
        logger.info(
            "  %-10s mean %.3f  %.1fs/page  -> %s  (14k pages ~ %.1fh)",
            engine.name,
            mean,
            pace,
            status,
            pace * 14000 / 3600,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
