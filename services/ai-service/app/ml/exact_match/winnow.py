"""k-gram shingling, Rabin-Karp rolling hashes, and winnowing.

Winnowing (Schleimer, Wilkerson & Aiken, SIGMOD 2003) keeps a provably-selected
subset of a document's k-gram hashes: roughly ``2/(w+1)`` of them, while
guaranteeing that any shared token run of length ``>= k + w - 1`` produces at
least one shared kept hash. That is what makes exact matching against a large
corpus an index lookup instead of a pairwise scan.

Hashing is deliberately *not* :func:`hash` — CPython randomizes string hashing per
process (``PYTHONHASHSEED``), which would make a stored corpus unmatchable after a
restart. FNV-1a over UTF-8 bytes is stable forever.
"""

from __future__ import annotations

from collections import deque

from app.ml.exact_match.config import ExactMatchConfig

# Bump when hashing or winnowing changes shape — stored fingerprints from an older
# version can no longer be compared and must be re-imported.
FINGERPRINT_VERSION = 1

# Mersenne prime; every hash fits in a positive signed 64-bit integer (Postgres bigint).
HASH_MODULUS = (1 << 61) - 1
HASH_BASE = 1_000_003

_FNV_OFFSET = 0xCBF29CE484222325
_FNV_PRIME = 0x100000001B3
_UINT64 = 0xFFFFFFFFFFFFFFFF


def token_hash(word: str) -> int:
    """Stable 64-bit FNV-1a hash of a normalized token."""
    h = _FNV_OFFSET
    for byte in word.encode("utf-8"):
        h ^= byte
        h = (h * _FNV_PRIME) & _UINT64
    return h % HASH_MODULUS


def shingle_hashes(words: list[str], k: int) -> list[int]:
    """
    Rolling hash of every k-token window.

    ``result[j]`` covers ``words[j:j + k]``. Returns ``[]`` when the text is
    shorter than ``k`` tokens.
    """
    if k < 1:
        raise ValueError("k must be >= 1")
    n = len(words)
    if n < k:
        return []

    values = [token_hash(w) for w in words]
    high_power = pow(HASH_BASE, k - 1, HASH_MODULUS)

    rolling = 0
    for i in range(k):
        rolling = (rolling * HASH_BASE + values[i]) % HASH_MODULUS

    hashes = [rolling]
    for j in range(1, n - k + 1):
        dropped = (values[j - 1] * high_power) % HASH_MODULUS
        rolling = ((rolling - dropped) * HASH_BASE + values[j + k - 1]) % HASH_MODULUS
        hashes.append(rolling)
    return hashes


def winnow(hashes: list[int], w: int) -> list[tuple[int, int]]:
    """
    Select the minimum hash of every window of ``w`` consecutive hashes.

    Ties resolve to the rightmost occurrence, and a selection is emitted only when
    it differs from the previous one — both per Schleimer et al., and both required
    for two documents to select the *same* positions in shared regions.

    Returns ``(hash, position)`` pairs where position indexes ``hashes``.
    """
    if w < 1:
        raise ValueError("w must be >= 1")
    if not hashes:
        return []
    if w == 1:
        return [(h, i) for i, h in enumerate(hashes)]

    selected: list[tuple[int, int]] = []
    window: deque[int] = deque()  # indices, hashes increasing front -> back
    last_emitted = -1

    for i, value in enumerate(hashes):
        # `>=` drops earlier equals, so the front of a tie is the rightmost index.
        while window and hashes[window[-1]] >= value:
            window.pop()
        window.append(i)
        while window[0] <= i - w:
            window.popleft()

        if i < w - 1:
            continue
        candidate = window[0]
        if candidate != last_emitted:
            selected.append((hashes[candidate], candidate))
            last_emitted = candidate

    return selected


def fingerprint(
    words: list[str],
    config: ExactMatchConfig | None = None,
) -> list[tuple[int, int]]:
    """
    Full pipeline: normalized tokens to ``(hash, token_position)`` fingerprints.

    ``token_position`` is the index of the first token of the k-gram, so a hit at
    position ``p`` covers ``words[p:p + k]``.
    """
    cfg = config or ExactMatchConfig()
    cfg.validate()
    hashes = shingle_hashes(words, cfg.k_gram)
    if not hashes:
        return []
    return winnow(hashes, cfg.window)
