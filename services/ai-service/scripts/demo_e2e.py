"""End-to-end plagiarism check through the running product.

Ground truth is arithmetic: a manuscript is built from ``copied`` tokens lifted
verbatim out of one **GOOD** corpus document plus shuffled filler from another,
so the true overlap is known before the run starts.

Usage (from ``services/ai-service``, stack up on 5243/5245/5246)::

    python scripts/demo_e2e.py
    python scripts/demo_e2e.py --ratios 30
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
import uuid
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import psycopg  # noqa: E402
import requests  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.ml.exact_match.text_quality import TextQuality, assess_text  # noqa: E402

API = "http://127.0.0.1:5243/api/v1"
EDITOR = ("editor@folio.dev", "Editor123!")
SEED = 20260809
TOLERANCE_PP = 3.0
MANUSCRIPT_TOKENS = 3000


def db_dsn() -> dict:
    s = get_settings()
    return {
        "host": s.vector_db_host,
        "port": s.vector_db_port,
        "user": s.vector_db_user,
        "password": s.vector_db_password,
        "dbname": s.vector_db_database,
    }


@dataclass
class Source:
    doc_id: str
    title: str
    words: list[str]


def load_sources(conn) -> tuple[Source, list[str]]:
    """Pick GOOD text-retaining docs that still have fingerprints."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT d.id::text, d.title, d.retained_text
            FROM corpus_documents d
            WHERE d.source_kind = 'back_catalog'
              AND d.retained_text IS NOT NULL
              AND d.token_count BETWEEN 2500 AND 9000
              AND EXISTS (
                    SELECT 1 FROM corpus_fingerprints f WHERE f.doc_id = d.id
              )
            ORDER BY d.token_count DESC
            LIMIT 40
            """,
        )
        rows = cur.fetchall()

    from app.ml.exact_match.arabic_normalize import tokenize  # noqa: PLC0415

    good: list[tuple[str, str, list[str], float]] = []
    for doc_id, title, text in rows:
        report = assess_text(text)
        if report.quality is not TextQuality.GOOD:
            continue
        title = title or "(untitled)"
        # Prefer Arabic titles so the Doctor sees a real article name, not a
        # journal masthead like "for the economic and political sciences".
        # Also prefer bodies that still carry original orthography (ة / على)
        # so evidence is not the folded matching form after a partial reindex.
        arabic_chars = sum(1 for ch in title if "\u0600" <= ch <= "\u06FF")
        original_ortho = ("ة" in text) or ("على" in text)
        if not original_ortho:
            continue
        score = report.function_word_ratio + (0.5 if arabic_chars >= 10 else 0.0)
        # Original token surfaces (aligned with fingerprint word_pos via tokenize).
        words = [text[t.start : t.end] for t in tokenize(text)]
        good.append((doc_id, title, words, score))

    if len(good) < 2:
        raise SystemExit("need at least 2 GOOD text-retaining corpus documents with fingerprints")

    good.sort(key=lambda row: row[3], reverse=True)
    source = Source(good[0][0], good[0][1], good[0][2])
    pool = list(good[1][2])
    rng = random.Random(SEED)
    rng.shuffle(pool)
    return source, pool


def ensure_editor_role(conn) -> str:
    with conn.cursor() as cur:
        cur.execute("SELECT id::text FROM users WHERE email = %s", (EDITOR[0],))
        row = cur.fetchone()
        if row is None:
            raise SystemExit(f"user {EDITOR[0]} not found")
        user_id = row[0]
        cur.execute(
            """
            INSERT INTO user_roles (user_id, role_id)
            SELECT %s, r.id FROM roles r WHERE r.slug = 'editor'
            ON CONFLICT DO NOTHING
            """,
            (user_id,),
        )
    conn.commit()
    return user_id


def other_author(conn, editor_id: str) -> str:
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id::text FROM users WHERE id <> %s ORDER BY created_at LIMIT 1",
            (editor_id,),
        )
        row = cur.fetchone()
    if row is None:
        raise SystemExit("no second user to own the submission")
    return row[0]


def build_manuscript(source: Source, pool: list[str], ratio: float) -> tuple[str, list[str], float]:
    copied_n = int(round(MANUSCRIPT_TOKENS * ratio))
    filler_n = MANUSCRIPT_TOKENS - copied_n

    rng = random.Random(SEED + int(ratio * 1000))
    start = rng.randint(0, max(0, len(source.words) - copied_n - 1)) if copied_n else 0
    copied = source.words[start : start + copied_n]
    filler = [pool[i % len(pool)] for i in range(filler_n)]

    block = 150
    chunks: list[list[str]] = []
    ci = fi = 0
    while ci < len(copied) or fi < len(filler):
        if fi < len(filler):
            chunks.append(filler[fi : fi + block])
            fi += block
        if ci < len(copied):
            chunks.append(copied[ci : ci + block])
            ci += block

    paragraphs = [" ".join(c) for c in chunks if c]
    title = f"دراسة تجريبية للكشف عن الاقتباس {int(ratio * 100)}"
    total = len(title.split()) + sum(len(p.split()) for p in paragraphs)
    return title, paragraphs, len(copied) / total


def constructor_content(title: str, paragraphs: list[str]) -> dict:
    sections: list[dict] = [{"id": "sec-title", "kind": "title", "text": title}]
    sections += [
        {"id": f"sec-p{i}", "kind": "paragraph", "html": f"<p>{text}</p>"}
        for i, text in enumerate(paragraphs)
    ]
    return {"defaultDir": "rtl", "sections": sections}


def insert_submission(conn, author_id: str, title: str, content: dict) -> str:
    slug = f"plagiarism-demo-{uuid.uuid4().hex[:12]}"
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO submissions
                (id, author_id, slug, title, abstract, constructor_content,
                 status, originality_confirmed, disciplines, discipline_suggested_labels)
            VALUES (gen_random_uuid(), %s, %s, %s, %s, %s::jsonb,
                    'submitted', true, '{}', '{}')
            """,
            (author_id, slug, title, "ملخص تجريبي لاختبار كشف الاقتباس.", json.dumps(content)),
        )
    conn.commit()
    return slug


def login() -> dict:
    r = requests.post(
        f"{API}/auth/login",
        json={"email": EDITOR[0], "password": EDITOR[1]},
        timeout=30,
    )
    r.raise_for_status()
    body = r.json()
    return {
        "Authorization": f"Bearer {body['accessToken']}",
        "x-csrf-token": body.get("csrfToken", ""),
    }


def run_job(headers: dict, slug: str, timeout: int = 600) -> dict:
    r = requests.post(
        f"{API}/submissions/{slug}/corpus-similarity/jobs",
        headers=headers,
        json={},
        timeout=60,
    )
    r.raise_for_status()
    started = r.json()
    job_id = started.get("jobId")
    if not job_id:
        return {"__precheck": started}

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        g = requests.get(
            f"{API}/submissions/{slug}/corpus-similarity/jobs/{job_id}",
            headers=headers,
            timeout=60,
        )
        g.raise_for_status()
        job = g.json()
        if job.get("status") in {"completed", "failed"}:
            return job
        time.sleep(2)
    return {"__timeout": job_id}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ratios", type=float, nargs="*", default=[0, 10, 30, 50, 100])
    args = parser.parse_args()

    with psycopg.connect(**db_dsn()) as conn:
        source, pool = load_sources(conn)
        editor_id = ensure_editor_role(conn)
        author_id = other_author(conn, editor_id)

        print(f"copy source : {source.title[:70]}")
        print(f"              {source.doc_id}  ({len(source.words)} tokens)")
        print(f"filler pool : {len(pool)} shuffled tokens from a different GOOD document\n")

        header = f"{'target':>7}{'expected':>10}{'reported':>10}{'delta':>8}{'named?':>8}{'secs':>7}  verdict"
        print(header)
        print("-" * len(header))

        headers = login()
        failures = 0
        rows = []

        for pct in args.ratios:
            ratio = pct / 100.0
            title, paragraphs, expected = build_manuscript(source, pool, ratio)
            slug = insert_submission(conn, author_id, title, constructor_content(title, paragraphs))

            t0 = time.monotonic()
            job = run_job(headers, slug)
            elapsed = time.monotonic() - t0

            if "__precheck" in job or "__timeout" in job:
                print(f"{pct:>6.0f}% {'':>9} {'':>9} {'':>7} {'':>7} {elapsed:>6.1f}  {job}")
                failures += 1
                continue

            exact = (job.get("result") or {}).get("exact") or {}
            reported = float(exact.get("overallPercent") or 0.0)
            expected_pct = expected * 100
            delta = reported - expected_pct
            sources = exact.get("sources") or []
            named = source.doc_id in {s.get("docId") for s in sources}
            snippet_ok = True
            if pct > 0 and sources:
                # Evidence must be readable Arabic, not cipher text.
                sample = (sources[0].get("spans") or [{}])[0]
                evidence = (sample.get("matchedSnippet") or sample.get("submissionSnippet") or "")
                if assess_text(evidence * 20).quality is TextQuality.BROKEN:
                    snippet_ok = False

            ok = abs(delta) <= TOLERANCE_PP and (named or pct == 0) and snippet_ok
            if not ok:
                failures += 1
            verdict = "ok" if ok else "FAIL"
            flag = "yes" if named else ("n/a" if pct == 0 else "NO")
            print(
                f"{pct:>6.0f}% {expected_pct:>9.1f} {reported:>9.1f} "
                f"{delta:>+7.1f} {flag:>7} {elapsed:>6.1f}  {verdict}  {slug}",
            )
            rows.append(
                {
                    "target_pct": pct,
                    "expected_pct": round(expected_pct, 2),
                    "reported_pct": reported,
                    "delta_pp": round(delta, 2),
                    "source_named": named,
                    "snippet_ok": snippet_ok,
                    "seconds": round(elapsed, 2),
                    "slug": slug,
                    "source_title": source.title,
                    "sources": sources,
                },
            )

        out = Path(__file__).with_name("demo_e2e_results.json")
        out.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n{len(args.ratios) - failures}/{len(args.ratios)} passed   ->  {out.name}")
        return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
