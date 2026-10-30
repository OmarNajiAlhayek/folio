"""Block fetches of loopback, private, and link-local addresses.

Plagiarism URLs come from Google CSE, Unpaywall, and OpenAlex. Any of those
can redirect. Each hop is resolved and checked before the socket opens, so a
redirect to 169.254.169.254 is refused instead of followed.
"""

from __future__ import annotations

import ipaddress
import socket
from collections.abc import Callable
from typing import Any
from urllib.parse import urljoin, urlparse

# One landing page plus a few publisher hops. Past this, fail closed.
MAX_REDIRECTS = 5

_REDIRECT_STATUSES = frozenset({301, 302, 303, 307, 308})


class UnsafeFetchTarget(Exception):
    """The URL is not an http(s) address on a public network."""


def _unpack(
    ip: ipaddress.IPv4Address | ipaddress.IPv6Address,
) -> ipaddress.IPv4Address | ipaddress.IPv6Address:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        return ip.ipv4_mapped
    return ip


def _blocked(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    address = _unpack(ip)
    return bool(
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_reserved
        or address.is_unspecified
    )


def _literal_addresses(host: str) -> list[str] | None:
    """IP forms that must not be sent to DNS, including the short and decimal ones."""
    try:
        return [str(ipaddress.ip_address(host))]
    except ValueError:
        pass
    if host.isdigit():
        value = int(host)
        if 0 <= value <= 0xFFFFFFFF:
            return [socket.inet_ntoa(value.to_bytes(4, "big"))]
        raise UnsafeFetchTarget("address out of range")
    if host.replace(".", "").isdigit() and host.count(".") >= 1:
        try:
            return [socket.inet_ntoa(socket.inet_aton(host))]
        except OSError as exc:
            raise UnsafeFetchTarget("invalid address") from exc
    return None


def _resolved_addresses(host: str, port: int) -> list[str]:
    literal = _literal_addresses(host)
    if literal is not None:
        return literal
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise UnsafeFetchTarget(f"could not resolve {host}") from exc
    addresses = [info[4][0] for info in infos if info[4]]
    if not addresses:
        raise UnsafeFetchTarget(f"could not resolve {host}")
    return addresses


def assert_public_http_url(url: str) -> None:
    """Refuse non-http(s) URLs and any target with a blocked address.

    A name that resolves to both a public address and a private one is refused.
    Callers check again after every redirect.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeFetchTarget(f"scheme {parsed.scheme or 'missing'} is not allowed")
    host = parsed.hostname
    if not host:
        raise UnsafeFetchTarget("url has no host")
    port = parsed.port
    if port is None:
        port = 443 if parsed.scheme == "https" else 80
    for address in _resolved_addresses(host, port):
        try:
            ip = ipaddress.ip_address(address.split("%", 1)[0])
        except ValueError as exc:
            raise UnsafeFetchTarget(f"unreadable address for {host}") from exc
        if _blocked(ip):
            raise UnsafeFetchTarget(f"refusing {host}")


def _is_redirect(response: Any) -> bool:
    return getattr(response, "status_code", None) in _REDIRECT_STATUSES


def guarded_get(request: Callable[..., Any], url: str, **kwargs: Any) -> Any:
    """GET ``url`` with redirects disabled inside ``request``.

    ``request`` is ``requests.get`` or ``session.get``. This function follows
    redirects itself so the next address is checked before it is requested.
    """
    kwargs["allow_redirects"] = False
    current = url
    for hop in range(MAX_REDIRECTS + 1):
        assert_public_http_url(current)
        response = request(current, **kwargs)
        if response is None or not _is_redirect(response):
            return response
        location = ""
        headers = getattr(response, "headers", None)
        if headers is not None:
            location = str(headers.get("Location") or "").strip()
        if not location or hop == MAX_REDIRECTS:
            raise UnsafeFetchTarget("too many redirects")
        closer = getattr(response, "close", None)
        if closer is not None:
            closer()
        current = urljoin(current, location)
    raise UnsafeFetchTarget("too many redirects")
