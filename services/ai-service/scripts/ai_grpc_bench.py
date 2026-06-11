"""gRPC latency and async job throughput benchmarks for ai-service.

Usage (from services/ai-service):
  python scripts/ai_grpc_bench.py --host localhost:5246 --output ../../perf/reports/ai-grpc.json

Optional corpus-similarity job bench (needs running backend):
  python scripts/ai_grpc_bench.py --api-base http://localhost:5243/api/v1 \\
    --editor-token <jwt> --corpus-slug <slug> --ci
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import grpc

SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

import app.grpc  # noqa: E402, F401 — adds generated proto packages to sys.path

from folio.ai.v1 import (
    classifier_pb2,
    classifier_pb2_grpc,
    keywords_pb2,
    keywords_pb2_grpc,
    similarity_pb2,
    similarity_pb2_grpc,
)

DEFAULT_THRESHOLDS = {
    "syncRpcP95Ms": 500,
    "corpusJobsCount": 10,
    "corpusJobsDrainSecondsMax": 180,
}


def load_service_token() -> str:
    try:
        from dotenv import load_dotenv

        load_dotenv(SERVICE_ROOT / ".env")
    except ImportError:
        pass
    return os.environ.get("AI_SERVICE_TOKEN", "").strip()


def grpc_metadata(token: str) -> tuple[tuple[str, str], ...]:
    if not token:
        return ()
    return (("x-folio-service-token", token),)


@dataclass
class RpcBenchResult:
    name: str
    count: int
    errors: int
    durations_ms: list[float] = field(default_factory=list)

    def summary(self) -> dict[str, Any]:
        if not self.durations_ms:
            return {
                "name": self.name,
                "count": self.count,
                "errors": self.errors,
                "p50Ms": None,
                "p95Ms": None,
                "p99Ms": None,
                "rps": 0.0,
            }
        sorted_ms = sorted(self.durations_ms)
        n = len(sorted_ms)

        def pct(p: float) -> float:
            idx = min(n - 1, max(0, int(p * n) - 1))
            return sorted_ms[idx]

        total_sec = sum(self.durations_ms) / 1000.0
        return {
            "name": self.name,
            "count": self.count,
            "errors": self.errors,
            "p50Ms": round(pct(0.50), 2),
            "p95Ms": round(pct(0.95), 2),
            "p99Ms": round(pct(0.99), 2),
            "rps": round(self.count / total_sec, 2) if total_sec > 0 else 0.0,
        }


async def bench_classify(
    stub: classifier_pb2_grpc.ClassifierServiceStub,
    n: int,
    metadata: tuple[tuple[str, str], ...],
) -> RpcBenchResult:
    result = RpcBenchResult(name="ClassifyArticle", count=n, errors=0)

    async def one() -> None:
        start = time.perf_counter()
        try:
            await stub.ClassifyArticle(
                classifier_pb2.ClassifyArticleRequest(
                    title="Machine learning in education",
                    abstract="نص عربي للاختبار " * 5,
                    keywords="education, ml",
                ),
                metadata=metadata,
            )
        except grpc.RpcError:
            result.errors += 1
        else:
            result.durations_ms.append((time.perf_counter() - start) * 1000)

    await asyncio.gather(*(one() for _ in range(n)))
    return result


async def bench_keywords(
    stub: keywords_pb2_grpc.KeywordServiceStub,
    n: int,
    metadata: tuple[tuple[str, str], ...],
) -> RpcBenchResult:
    result = RpcBenchResult(name="SuggestKeywords", count=n, errors=0)

    async def one() -> None:
        start = time.perf_counter()
        try:
            await stub.SuggestKeywords(
                keywords_pb2.SuggestKeywordsRequest(
                    title="Open access publishing",
                    abstract="We study digital publishing policies in peer-reviewed journals.",
                ),
                metadata=metadata,
            )
        except grpc.RpcError:
            result.errors += 1
        else:
            result.durations_ms.append((time.perf_counter() - start) * 1000)

    await asyncio.gather(*(one() for _ in range(n)))
    return result


async def bench_similarity(
    stub: similarity_pb2_grpc.SimilarityServiceStub,
    n: int,
    metadata: tuple[tuple[str, str], ...],
) -> RpcBenchResult:
    result = RpcBenchResult(name="FindSimilarArticles", count=n, errors=0)

    async def one() -> None:
        start = time.perf_counter()
        try:
            await stub.FindSimilarArticles(
                similarity_pb2.FindSimilarArticlesRequest(
                    article_id="perf-bench-article",
                    limit=5,
                ),
                metadata=metadata,
            )
        except grpc.RpcError:
            result.errors += 1
        else:
            result.durations_ms.append((time.perf_counter() - start) * 1000)

    await asyncio.gather(*(one() for _ in range(n)))
    return result


async def rpc_enabled(
    stub: classifier_pb2_grpc.ClassifierServiceStub,
    metadata: tuple[tuple[str, str], ...],
) -> bool:
    try:
        await stub.ClassifyArticle(
            classifier_pb2.ClassifyArticleRequest(abstract="warmup"),
            metadata=metadata,
        )
        return True
    except grpc.RpcError as err:
        if err.code() == grpc.StatusCode.FAILED_PRECONDITION:
            return False
        raise


async def keywords_enabled(
    stub: keywords_pb2_grpc.KeywordServiceStub,
    metadata: tuple[tuple[str, str], ...],
) -> bool:
    try:
        await stub.SuggestKeywords(
            keywords_pb2.SuggestKeywordsRequest(title="warmup", abstract="warmup"),
            metadata=metadata,
        )
        return True
    except grpc.RpcError as err:
        if err.code() in (
            grpc.StatusCode.FAILED_PRECONDITION,
            grpc.StatusCode.UNAVAILABLE,
        ):
            return False
        raise


async def similarity_enabled(
    stub: similarity_pb2_grpc.SimilarityServiceStub,
    metadata: tuple[tuple[str, str], ...],
) -> bool:
    try:
        await stub.FindSimilarArticles(
            similarity_pb2.FindSimilarArticlesRequest(article_id="warmup", limit=1),
            metadata=metadata,
        )
        return True
    except grpc.RpcError as err:
        if err.code() in (
            grpc.StatusCode.FAILED_PRECONDITION,
            grpc.StatusCode.UNAVAILABLE,
        ):
            return False
        raise


async def run_sync_bench(
    host: str,
    concurrency: int,
    warmup: int,
    metadata: tuple[tuple[str, str], ...],
) -> list[RpcBenchResult]:
    channel = grpc.aio.insecure_channel(host)
    classifier = classifier_pb2_grpc.ClassifierServiceStub(channel)
    keywords = keywords_pb2_grpc.KeywordServiceStub(channel)
    similarity = similarity_pb2_grpc.SimilarityServiceStub(channel)

    try:
        run_classify = await rpc_enabled(classifier, metadata)
        run_keywords = await keywords_enabled(keywords, metadata)
        run_similarity = await similarity_enabled(similarity, metadata)

        if run_classify:
            for _ in range(warmup):
                await classifier.ClassifyArticle(
                    classifier_pb2.ClassifyArticleRequest(abstract="warmup"),
                    metadata=metadata,
                )

        tasks: list[asyncio.Task[RpcBenchResult]] = []
        if run_classify:
            tasks.append(asyncio.create_task(
                bench_classify(classifier, concurrency, metadata)
            ))
        if run_keywords:
            tasks.append(asyncio.create_task(
                bench_keywords(keywords, concurrency, metadata)
            ))
        if run_similarity:
            tasks.append(asyncio.create_task(
                bench_similarity(similarity, concurrency, metadata)
            ))

        if not tasks:
            return []

        return list(await asyncio.gather(*tasks))
    finally:
        await channel.close()


def http_json(
    method: str,
    url: str,
    *,
    token: str | None = None,
    body: dict[str, Any] | None = None,
) -> tuple[int, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8")
        try:
            payload = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            payload = raw
        return err.code, payload


def bench_corpus_jobs(
    api_base: str,
    editor_token: str,
    submission_slug: str,
    job_count: int,
) -> dict[str, Any]:
    base = api_base.rstrip("/")
    start = time.perf_counter()
    job_ids: list[str] = []

    for i in range(job_count):
        status, body = http_json(
            "POST",
            f"{base}/submissions/{submission_slug}/corpus-similarity/jobs",
            token=editor_token,
        )
        if status not in (200, 201):
            return {
                "ok": False,
                "error": f"enqueue {i} failed: HTTP {status} {body}",
                "jobCount": job_count,
            }
        if isinstance(body, dict) and body.get("jobId"):
            job_ids.append(str(body["jobId"]))

    deadline = time.perf_counter() + 180
    terminal = 0
    while time.perf_counter() < deadline and job_ids:
        terminal = 0
        for job_id in job_ids:
            status, body = http_json(
                "GET",
                f"{base}/submissions/{submission_slug}/corpus-similarity/jobs/{job_id}",
                token=editor_token,
            )
            if status != 200 or not isinstance(body, dict):
                continue
            if body.get("status") in ("completed", "failed"):
                terminal += 1
        if terminal >= len(job_ids):
            break
        time.sleep(1.5)

    elapsed = time.perf_counter() - start
    return {
        "ok": terminal >= len(job_ids),
        "jobCount": job_count,
        "jobsCompleted": terminal,
        "drainSeconds": round(elapsed, 2),
        "jobsPerMinute": round((terminal / elapsed) * 60, 2) if elapsed > 0 else 0,
    }


def load_thresholds(path: Path | None) -> dict[str, Any]:
    if path is None or not path.is_file():
        return DEFAULT_THRESHOLDS
    data = json.loads(path.read_text(encoding="utf-8"))
    return {**DEFAULT_THRESHOLDS, **data.get("aiGrpc", {})}


def assert_ci_thresholds(report: dict[str, Any], thresholds: dict[str, Any]) -> None:
    sync_rpc = report.get("syncRpc") or []
    if not sync_rpc:
        print("ai_grpc_bench: no enabled RPC suites — skipping sync RPC CI thresholds")
        return
    for rpc in sync_rpc:
        p95 = rpc.get("p95Ms")
        if p95 is not None and p95 > thresholds["syncRpcP95Ms"]:
            raise SystemExit(
                f"CI threshold failed: {rpc['name']} p95 {p95}ms > {thresholds['syncRpcP95Ms']}ms",
            )
        if rpc.get("errors", 0) > 0:
            raise SystemExit(f"CI threshold failed: {rpc['name']} had {rpc['errors']} errors")

    corpus = report.get("corpusJobs")
    if corpus:
        if not corpus.get("ok"):
            raise SystemExit(f"CI threshold failed: corpus jobs did not drain — {corpus}")
        if corpus.get("drainSeconds", 0) > thresholds["corpusJobsDrainSecondsMax"]:
            raise SystemExit(
                "CI threshold failed: corpus drain "
                f"{corpus['drainSeconds']}s > {thresholds['corpusJobsDrainSecondsMax']}s",
            )


async def main_async(args: argparse.Namespace) -> dict[str, Any]:
    thresholds_path = Path(args.thresholds) if args.thresholds else None
    thresholds = load_thresholds(thresholds_path)
    concurrency = args.concurrency
    metadata = grpc_metadata(args.service_token or load_service_token())

    sync_results = await run_sync_bench(args.host, concurrency, args.warmup, metadata)
    report: dict[str, Any] = {
        "suite": "ai-grpc",
        "host": args.host,
        "concurrency": concurrency,
        "syncRpc": [r.summary() for r in sync_results],
    }

    if args.api_base and args.editor_token and args.corpus_slug:
        report["corpusJobs"] = bench_corpus_jobs(
            args.api_base,
            args.editor_token,
            args.corpus_slug,
            int(thresholds["corpusJobsCount"]),
        )

    if args.ci:
        assert_ci_thresholds(report, thresholds)

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="ai-service gRPC perf benchmark")
    parser.add_argument("--host", default="localhost:5246")
    parser.add_argument(
        "--service-token",
        default="",
        help="x-folio-service-token (defaults to AI_SERVICE_TOKEN from .env)",
    )
    parser.add_argument("--concurrency", type=int, default=50)
    parser.add_argument("--warmup", type=int, default=3)
    parser.add_argument("--api-base", default="")
    parser.add_argument("--editor-token", default="")
    parser.add_argument("--corpus-slug", default="")
    parser.add_argument("--output", default="")
    parser.add_argument("--thresholds", default="")
    parser.add_argument("--ci", action="store_true")
    args = parser.parse_args()

    report = asyncio.run(main_async(args))

    text = json.dumps(report, indent=2)
    print(text)

    if args.output:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as exc:
        print(f"ai_grpc_bench failed: {exc}", file=sys.stderr)
        sys.exit(1)
