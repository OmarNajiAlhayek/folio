"""Orchestrate web plagiarism detection: CSE → fetch → AraBERT similarity."""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass

from app.ml.web_similarity.arabert_embedder import AraBertEmbedder
from app.ml.web_similarity.google_cse import get_search_results
from app.ml.web_similarity.query_extract import extract_query_passages
from app.ml.web_similarity.text_clean import clean_text
from app.ml.web_similarity.web_fetch import fetch_web_paragraphs

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class WebSimilarityMatch:
    query_snippet: str
    source_url: str
    matched_snippet: str
    similarity: float


class WebPlagiarismService:
    def __init__(
        self,
        *,
        api_key: str,
        cse_id: str,
        max_queries: int = 5,
        results_per_query: int = 10,
        threshold: float = 70.0,
        search_lang: str = "ar",
        fetch_workers: int = 5,
    ) -> None:
        self._api_key = api_key
        self._cse_id = cse_id
        self._max_queries = max_queries
        self._results_per_query = results_per_query
        self._threshold = threshold
        self._search_lang = search_lang
        self._fetch_workers = fetch_workers
        self._embedder: AraBertEmbedder | None = None

    def _get_embedder(self) -> AraBertEmbedder:
        if self._embedder is None:
            self._embedder = AraBertEmbedder.get_instance()
        return self._embedder

    def _score_url(
        self,
        query_snippet: str,
        query_clean: str,
        url: str,
    ) -> WebSimilarityMatch | None:
        paragraphs = fetch_web_paragraphs(url)
        if not paragraphs:
            return None

        embedder = self._get_embedder()
        best_sim = 0.0
        best_para = ""
        for para in paragraphs:
            try:
                sim = embedder.cosine_sim(query_clean, clean_text(para))
            except Exception as exc:
                logger.debug("Embed failed for %s: %s", url, exc)
                continue
            if sim > best_sim:
                best_sim = sim
                best_para = para

        if best_sim < self._threshold:
            return None

        return WebSimilarityMatch(
            query_snippet=query_snippet,
            source_url=url,
            matched_snippet=best_para[:500],
            similarity=best_sim,
        )

    def detect(self, submission_text: str) -> list[WebSimilarityMatch]:
        queries = extract_query_passages(
            submission_text,
            max_queries=self._max_queries,
        )
        if not queries:
            return []

        matches: list[WebSimilarityMatch] = []
        seen_urls: set[str] = set()

        for query in queries:
            urls = get_search_results(
                query,
                api_key=self._api_key,
                cse_id=self._cse_id,
                num_results=self._results_per_query,
                search_lang=self._search_lang,
            )
            if not urls:
                continue

            try:
                query_clean = clean_text(query)
            except Exception as exc:
                logger.warning("Failed to clean query passage: %s", exc)
                continue

            with ThreadPoolExecutor(max_workers=self._fetch_workers) as pool:
                futures = {
                    pool.submit(self._score_url, query, query_clean, url): url
                    for url in urls
                    if url not in seen_urls
                }
                for future in as_completed(futures):
                    url = futures[future]
                    try:
                        hit = future.result()
                    except Exception as exc:
                        logger.debug("URL scoring failed for %s: %s", url, exc)
                        continue
                    if hit is None:
                        continue
                    seen_urls.add(url)
                    matches.append(hit)

        matches.sort(key=lambda m: m.similarity, reverse=True)
        return matches
