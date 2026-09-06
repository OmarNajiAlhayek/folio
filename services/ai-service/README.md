# Damascus University Journal AI service

Python **FastAPI** microservice for Damascus University Journal AI features: health probes, environment validation, a pluggable LLM provider layer (`noop` by default), optional **AraBERT Arabic discipline classifier**, **keyword suggestions**, **article similarity**, **corpus plagiarism detection**, **reviewer matching**, and **copyedit reference cross-checking** — all product traffic over **gRPC** (Nest BFF only).

Design record: [`docs/plans/ai-service.md`](../../docs/plans/ai-service.md).

## Prerequisites

- Python 3.12+

## Setup

```bash
cd services/ai-service
cp .env.example .env
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -e ".[dev]"
```

For the Arabic discipline classifier (local only):

```bash
pip install -e ".[dev,ml]"
```

`ml` requires `torch>=2.6.0,<2.7` (CVE-2025-32434; the training pin `2.5.1` is
unpatched and has no current default-index wheels). For GPU, install a CUDA
wheel from the matching [pytorch.org index](https://pytorch.org/get-started/locally/)
first, then the extra.

Place fine-tuned weights under `arabert_clean_model_FINAL-20260525T161953Z-3-001/arabert_clean_model_FINAL/` (or set `ARABERT_MODEL_PATH`). Weights are not committed to git.

## Run locally

```bash
uvicorn app.main:app --reload --port 5245
```

- **HTTP (5245):** liveness, readiness, aggregated `GET /v1/status` only. Defaults to `HTTP_BIND_HOST=127.0.0.1`.
- **gRPC (5246, `GRPC_PORT`):** all product RPCs for Nest (`ClassifierService`, `KeywordService`, `PlagiarismService`, `SimilarityService`, `ReviewerMatchingService`, `CopyeditService`). Defaults to `GRPC_BIND_HOST=127.0.0.1`. See [`proto/README.md`](../../proto/README.md).

For same-machine dev with Nest, set the same `AI_SERVICE_TOKEN` in `backend/.env` and `.env` here when `AI_SERVICE_ENABLED=true`.

When `ARABERT_ENABLED=true`, startup **preloads tokenizer + weights** by default (`ARABERT_WARMUP_ON_STARTUP=true`) so the first UI classify is fast. Expect ~1 minute extra startup time on CPU; set `ARABERT_WARMUP_ON_STARTUP=false` to skip.

- Liveness: `http://localhost:5245/health`
- Readiness: `http://localhost:5245/ready`
- API status: `http://localhost:5245/v1/status`

With `AI_PROVIDER=noop` (default), no API keys are required.

### gRPC smoke (grpcurl)

With reflection enabled in development:

```bash
grpcurl -plaintext localhost:5246 list
grpcurl -plaintext localhost:5246 folio.ai.v1.ClassifierService/GetClassifierStatus
grpcurl -plaintext localhost:5246 folio.ai.v1.SimilarityService/GetSimilarityStatus
```

With a service token configured:

```bash
grpcurl -plaintext -H "x-folio-service-token: YOUR_TOKEN" localhost:5246 folio.ai.v1.ClassifierService/GetClassifierStatus
```

Without reflection, pass `-import-path proto -proto folio/ai/v1/<service>.proto` from the repo root.

Regenerate stubs after editing `.proto`: `npm run proto:gen` (requires [Buf CLI](https://buf.build/docs/installation) or `npx buf` from repo root).

### AraBERT classifier (dev)

Set `ARABERT_ENABLED=true` in `.env`, then:

```bash
python scripts/verify_classifier.py
grpcurl -plaintext -d '{"abstract":"تهدف هذه الدراسة إلى تحليل الأثر الاقتصادي."}' \
  localhost:5246 folio.ai.v1.ClassifierService/ClassifyAbstract
```

Jupyter: open `archive/classify.ipynb` (imports `AdvancedArabicClassifier` from `app.ml`).

### Author keyword suggestions (dev)

Requires OpenAI (or compatible gateway):

```bash
# services/ai-service/.env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
KEYWORDS_SUGGESTION_ENABLED=true
AI_SERVICE_TOKEN=your-shared-secret
```

```bash
# backend/.env
AI_SERVICE_ENABLED=true
AI_KEYWORDS_ENABLED=true
AI_SERVICE_GRPC_HOST=127.0.0.1
AI_SERVICE_TOKEN=your-shared-secret
```

Nest route: `POST /submissions/:slug/suggest-keywords` (author draft only) → gRPC `KeywordService.SuggestKeywords` on port **5246**.

### Similarity and reviewer matching (dev)

```bash
# services/ai-service/.env
pip install -e ".[dev,similarity]"
SIMILARITY_ENABLED=true
REVIEWER_MATCHING_ENABLED=true

# backend/.env
AI_SERVICE_ENABLED=true
AI_SIMILARITY_ENABLED=true
AI_REVIEWER_MATCHING_ENABLED=true
AI_SERVICE_GRPC_HOST=127.0.0.1
```

Nest routes: `GET /submissions/:slug/corpus-similarity` (gRPC `PlagiarismService`), `GET /submissions/:slug/suggested-reviewers` (`ReviewerMatchingService`), public catalog `searchMode=semantic` (`SimilarityService`).

```bash
grpcurl -plaintext localhost:5246 folio.ai.v1.PlagiarismService/GetPlagiarismStatus
grpcurl -plaintext localhost:5246 folio.ai.v1.ReviewerMatchingService/GetReviewerMatchingStatus
```

### Copyedit reference cross-checking (dev)

Requires OpenAI (or compatible gateway):

```bash
# services/ai-service/.env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
COPYEDIT_ANALYSIS_ENABLED=true

# backend/.env
AI_SERVICE_ENABLED=true
AI_COPYEDIT_ENABLED=true
AI_SERVICE_GRPC_HOST=127.0.0.1
```

Nest route: `POST /copyedit-assignments/:slug/ai-analysis` → gRPC `CopyeditService.CheckReferences` on port **5246**. Grammar/spelling on the same route uses **LanguageTool** in Nest (`LANGUAGE_TOOL_ENABLED=true`; start the `languagetool` service from `docker-compose.dev.yml`).

```bash
grpcurl -plaintext localhost:5246 folio.ai.v1.CopyeditService/GetCopyeditStatus
```

Smoke from backend (ai-service running):

```bash
cd backend
npx ts-node scripts/smoke-copyedit-grpc.ts
```

### Exact-overlap corpus (plagiarism)

Verbatim matching runs off a winnowed k-gram index (`app/ml/exact_match/`) in
`corpus_documents` / `corpus_fingerprints`, separate from the pgvector semantic
path and independent of it — no embeddings, no torch.

```bash
pip install -e ".[corpus]"
# backend migration AddExactMatchCorpus must have run first
```

Fill the corpus, highest value first. The journal's own back catalogue matters
most: local authors copy from local prior issues far more than from anything an
English open-access API indexes.

```bash
# Tier 1 — back catalogue (PDF/DOCX/TXT, recursive). Text is stored: we own it.
python scripts/import_back_catalog.py ../../Damascus_Articles --category "الهندسة"
python scripts/import_back_catalog.py <dir> --dry-run     # extraction quality only

# Tier 2 — regional journals over OAI-PMH. No search engine, no scraping.
# Damascus itself is harvestable: 13 journals under one site-wide endpoint.
python scripts/import_oai_pmh.py https://journal.damascusuniversity.edu.sy --probe
python scripts/import_oai_pmh.py https://journal.damascusuniversity.edu.sy/index.php/index/oai --list-sets
python scripts/import_oai_pmh.py <oai-url> --set engj:ART --limit 200 --category "الهندسة"
python scripts/import_oai_pmh.py <oai-url> --from 2026-01-01     # incremental, nightly

# Tier 2b — CORE open access. Fingerprints only, never the text. Mostly English.
CORE_API_KEY=... python scripts/import_core_oa.py --query '"structural engineering"' --limit 500

# After any bulk import (also run automatically by both importers)
python scripts/import_back_catalog.py --refresh-stoplist-only
```

Tier 3 is the web check: distinctive passages go out as **quoted phrase queries**
so Google does the exact matching, and each fetched page is folded back into the
corpus as fingerprints (`SourceKind.WEB`), so the same page is matched for free
from then on. See `app/ml/exact_match/sources/web.py`.

Re-imports are cheap — a document whose normalized text is unchanged is skipped
without re-fingerprinting. Changing `k_gram`, `window`, or the hash in
`ExactMatchConfig` invalidates every stored fingerprint: re-run the importers.

### Broken Arabic PDFs

Many Arabic academic PDFs carry no usable `ToUnicode` CMap, so extractors emit
valid Arabic code points that spell nothing (`إت ل ف لدايرس ل ةا لب ةع`).
Indexing one is worse than skipping it: it looks successful and can never match.

Three defences, in order:

1. **Best-of-N extraction.** `extract_pdf` runs PyMuPDF, pdfplumber and pypdf and
   keeps whichever scores highest — they disagree, and not always in the same
   direction.
2. **A quality gate.** `text_quality.py` scores function-word frequency: real text
   runs 10-13%, broken extraction 0.6-2.9%. Measured on the Damascus catalogue
   the two populations do not overlap. Broken text is rejected, never indexed.
3. **OCR fallback** (`--ocr`), which renders the page and ignores the text layer.
   This is the only defence that generalizes — other institutions publish what
   they publish, and no amount of asking gets you their Word originals.

```bash
pip install -e ".[ocr]"     # Surya 0.17 + Tesseract bindings; host also needs tesseract + ara
python scripts/import_back_catalog.py <dir> --ocr
python scripts/import_oai_pmh.py <oai-url> --ocr
```

Pin note: extras install `surya-ocr>=0.17,<0.20` (torch-local API matching
`SuryaEngine`). Surya 2+ needs a vLLM Docker / llama.cpp server — do not bump
past 0.20 until the engine wrapper and runtime are updated.

Tesseract with `ara` lifted all four broken Damascus files from `broken` (0.023-0.026)
to `good` (0.088-0.091) at ~2.3s/page. OCR output goes through the same gate, and
is discarded if it scores no better than the text layer it replaced.

**Choosing an engine — measure, don't argue.** `scripts/ocr_bench.py` runs every
installed engine over the same pages of your real PDFs and prints quality and
pace:

```bash
python scripts/ocr_bench.py ../../Damascus_Articles --only-broken --pages 3
```

Known results on this corpus:

| Engine                     | Function-word score                         | Notes                                                                           |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------- |
| text layer (broken PDFs)   | 0.014-0.029                                 | unusable                                                                        |
| Tesseract `tessdata_fast`  | 0.074-0.091                                 | usable, free, CPU                                                               |
| Tesseract `tessdata_best`  | 0.077-0.095                                 | no real gain, 2.7x slower — not worth it                                        |
| Surya 0.17 (GPU, RTX 4060) | ~0.068-0.090 (mean ~0.079 on 3-page sample) | free, local torch; ~3× slower than Tesseract here; does not clearly beat it yet |
| clean DOCX (reference)     | 0.112-0.132                                 | the ceiling                                                                     |

Surya is preferred over a vision-language model for corpus text: it transcribes,
whereas a VLM _completes_. A VLM reading a smudged word writes a plausible word,
which in a plagiarism report means showing an editor source text the source never
contained.

Accuracy matters more here than for search: exact matching needs whole k-grams,
and at word error rate `p` a k-gram survives with probability `(1-p)^k`. At k=6,
5% error keeps 74% of fingerprints and 15% keeps 38% — so if Tesseract proves too
weak on a given corpus, swap `OcrEngine` for a cloud engine (~$1.50/1000 pages)
and re-measure with the same gate.

## Tests

```bash
pytest
ruff check app tests
```

Exact-match tests need no database or extras — detection runs against an
in-memory store:

```bash
pytest tests/test_exact_match.py
```

Full model inference (slow, needs weights):

```bash
RUN_ML_TESTS=1 pytest -m ml
```

## Container image

Built from this directory (unlike the Node services, it has no monorepo links) — the generated
protobuf stubs under `app/grpc/gen` are committed, so no Buf toolchain is needed:

```bash
docker build -t folio/ai-service .
docker run --rm -p 5245:5245 -e AI_PROVIDER=noop -e AI_SERVICE_TOKEN=... folio/ai-service
```

**Python extras are a build-time decision**, because they differ by an order of magnitude in size:

```bash
docker build --build-arg PIP_EXTRAS=corpus,similarity -t folio/ai-service .
```

| `PIP_EXTRAS`           | Approx. image | Enables                                                      |
| ---------------------- | ------------- | ------------------------------------------------------------ |
| `corpus` (default)     | ~250 MB       | Exact-overlap plagiarism and the corpus importers — no torch |
| `corpus,similarity`    | ~3 GB         | + embeddings, related articles, reviewer matching            |
| `corpus,similarity,ml` | ~3.5 GB       | + AraBERT classifier (weights are **not** in the image)      |

An extra only installs the code; the matching feature flag still has to be on.

The image binds both listeners to `0.0.0.0` because a container's loopback is useless to sibling services — which means **`AI_SERVICE_TOKEN` is mandatory**: startup refuses a non-loopback gRPC bind without it. Still, do **not** publish port **5246** outside the internal network; the backend reaches it as `AI_SERVICE_GRPC_HOST=ai-service`.

Runs as a non-root user with `dumb-init` as PID 1 and a `/health` healthcheck. Model downloads live in `HF_HOME` (`/srv/folio/cache`), mounted as a volume so replacing the container does not re-download weights. Ops scripts (`scripts/import_oai_pmh.py`, `scripts/reindex_ocr.py`, …) ship in the image:

```bash
docker compose run --rm ai-service python scripts/import_oai_pmh.py --help
```

Production images should set `APP_ENV=production`, and — when using an LLM — `AI_PROVIDER=openai` with a real `OPENAI_API_KEY`.

Stack, configuration and operations: [`../../docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md).
