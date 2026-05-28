import pytest

from app.providers.openai_compat import _is_local_compat_base_url


@pytest.mark.parametrize(
    "url,expected",
    [
        ("http://localhost:1234/v1", True),
        ("http://127.0.0.1:1234/v1", True),
        ("https://api.openai.com/v1", False),
        (None, False),
    ],
)
def test_is_local_compat_base_url(url: str | None, expected: bool) -> None:
    assert _is_local_compat_base_url(url) is expected
