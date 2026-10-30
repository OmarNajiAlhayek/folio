"""Plagiarism fetches stay on public http(s), including after a redirect."""

from __future__ import annotations

import importlib.util
import socket
from pathlib import Path
from typing import Any

import pytest

from app.ml.exact_match.fulltext import _get, resolve_fulltext
from app.ml.safe_http import UnsafeFetchTarget, assert_public_http_url


def _fetch_web_paragraphs():
    """Load the fetcher without ``web_similarity``'s package init.

    That init imports the AraBERT embedder, which imports torch. These tests
    only need ``web_fetch.py``.
    """
    pytest.importorskip("bs4")
    pytest.importorskip("requests")
    path = (
        Path(__file__).resolve().parents[1]
        / "app"
        / "ml"
        / "web_similarity"
        / "web_fetch.py"
    )
    spec = importlib.util.spec_from_file_location("folio_web_fetch_under_test", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.fetch_web_paragraphs


def _addrinfo(ip: str, port: int) -> list[tuple[Any, ...]]:
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, port))]


def _public_dns(host: str, port: int, *_args: Any, **_kwargs: Any) -> list[tuple[Any, ...]]:
    return _addrinfo("8.8.8.8", port)


class _Response:
    def __init__(
        self,
        status: int,
        *,
        body: str = "",
        location: str | None = None,
        url: str = "",
    ) -> None:
        self.status_code = status
        self.ok = status < 400
        self.text = body
        self.url = url
        self.encoding = "utf-8"
        self.apparent_encoding = "utf-8"
        self.headers = {"Location": location} if location else {}

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def close(self) -> None:
        return None


def test_http_and_https_to_a_public_address_are_allowed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(socket, "getaddrinfo", _public_dns)
    assert_public_http_url("https://example.com/paper")
    assert_public_http_url("http://example.com/paper")


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://example.com/paper",
        "gopher://example.com/",
        "http:///no-host",
        "javascript:alert(1)",
    ],
)
def test_non_http_schemes_are_refused(url: str) -> None:
    with pytest.raises(UnsafeFetchTarget):
        assert_public_http_url(url)


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://127.1/",
        "http://2130706433/",
        "http://10.1.2.3/",
        "http://172.16.0.5/latest",
        "http://192.168.0.8/",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]/",
        "http://[fe80::1]/",
        "http://[fc00::1]/",
        "http://[::ffff:169.254.169.254]/latest/meta-data",
        "http://0.0.0.0/",
    ],
)
def test_literal_internal_addresses_are_refused(url: str) -> None:
    with pytest.raises(UnsafeFetchTarget):
        assert_public_http_url(url)


def test_name_that_resolves_to_a_private_address_is_refused(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def dns(host: str, port: int, *_args: Any, **_kwargs: Any) -> list[tuple[Any, ...]]:
        return _addrinfo("10.0.0.5", port) + _addrinfo("8.8.8.8", port)

    monkeypatch.setattr(socket, "getaddrinfo", dns)
    with pytest.raises(UnsafeFetchTarget):
        assert_public_http_url("https://evil.example/paper")


def test_redirect_to_metadata_is_not_requested(monkeypatch: pytest.MonkeyPatch) -> None:
    import requests

    fetch_web_paragraphs = _fetch_web_paragraphs()

    calls: list[tuple[str, bool | None]] = []

    def fake_get(url: str, **kwargs: Any) -> _Response:
        calls.append((url, kwargs.get("allow_redirects")))
        return _Response(
            302,
            location="http://169.254.169.254/latest/meta-data",
            url=url,
        )

    monkeypatch.setattr(socket, "getaddrinfo", _public_dns)
    monkeypatch.setattr(requests, "get", fake_get)

    assert fetch_web_paragraphs("https://example.com/paper") == []
    assert calls == [("https://example.com/paper", False)]


def test_redirect_whose_name_resolves_internally_is_not_requested(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import requests

    fetch_web_paragraphs = _fetch_web_paragraphs()

    calls: list[str] = []

    def dns(host: str, port: int, *_args: Any, **_kwargs: Any) -> list[tuple[Any, ...]]:
        if host == "evil.example":
            return _addrinfo("169.254.169.254", port)
        return _addrinfo("8.8.8.8", port)

    def fake_get(url: str, **_kwargs: Any) -> _Response:
        calls.append(url)
        return _Response(302, location="http://evil.example/meta", url=url)

    monkeypatch.setattr(socket, "getaddrinfo", dns)
    monkeypatch.setattr(requests, "get", fake_get)

    assert fetch_web_paragraphs("https://example.com/paper") == []
    assert calls == ["https://example.com/paper"]


def test_public_redirect_is_followed(monkeypatch: pytest.MonkeyPatch) -> None:
    import requests

    fetch_web_paragraphs = _fetch_web_paragraphs()

    calls: list[str] = []
    paragraph = "A paragraph long enough to keep."

    def fake_get(url: str, **_kwargs: Any) -> _Response:
        calls.append(url)
        if url.endswith("/start"):
            return _Response(302, location="https://cdn.example/paper", url=url)
        return _Response(200, body=f"<p>{paragraph}</p>", url=url)

    monkeypatch.setattr(socket, "getaddrinfo", _public_dns)
    monkeypatch.setattr(requests, "get", fake_get)

    assert fetch_web_paragraphs("https://example.com/start") == [paragraph]
    assert calls == ["https://example.com/start", "https://cdn.example/paper"]


def test_metadata_literal_never_opens_a_socket(monkeypatch: pytest.MonkeyPatch) -> None:
    import requests

    fetch_web_paragraphs = _fetch_web_paragraphs()

    def fail_dns(*_args: Any, **_kwargs: Any) -> list[tuple[Any, ...]]:
        raise AssertionError("literal addresses must not be resolved")

    def fail_get(*_args: Any, **_kwargs: Any) -> _Response:
        raise AssertionError("internal target must not be fetched")

    monkeypatch.setattr(socket, "getaddrinfo", fail_dns)
    monkeypatch.setattr(requests, "get", fail_get)
    assert fetch_web_paragraphs("http://169.254.169.254/latest/meta-data") == []


def test_fulltext_downloader_rechecks_each_redirect(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, bool | None]] = []

    def dns(host: str, port: int, *_args: Any, **_kwargs: Any) -> list[tuple[Any, ...]]:
        if host == "evil.example":
            return _addrinfo("127.0.0.1", port)
        return _addrinfo("8.8.8.8", port)

    class Session:
        def get(self, url: str, **kwargs: Any) -> _Response:
            calls.append((url, kwargs.get("allow_redirects")))
            return _Response(302, location="http://evil.example/secret", url=url)

    monkeypatch.setattr(socket, "getaddrinfo", dns)
    assert _get(Session(), "https://api.example/works", timeout=5) is None
    assert calls == [("https://api.example/works", False)]


def test_resolve_fulltext_does_not_fetch_a_link_local_landing() -> None:
    class Session:
        def get(self, *_args: Any, **_kwargs: Any) -> _Response:
            raise AssertionError("link-local landing page must not be fetched")

    assert (
        resolve_fulltext("http://169.254.169.254/latest/meta-data", session=Session())
        is None
    )


def test_resolve_fulltext_stops_when_the_pdf_url_redirects_internally(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[str] = []

    def dns(host: str, port: int, *_args: Any, **_kwargs: Any) -> list[tuple[Any, ...]]:
        return _addrinfo("8.8.8.8", port)

    class Session:
        def get(self, url: str, **kwargs: Any) -> _Response:
            calls.append(url)
            assert kwargs.get("allow_redirects") is False
            return _Response(302, location="http://169.254.169.254/latest/meta-data", url=url)

    monkeypatch.setattr(socket, "getaddrinfo", dns)
    assert resolve_fulltext("https://publisher.example/article", session=Session()) is None
    assert calls == ["https://publisher.example/article"]
