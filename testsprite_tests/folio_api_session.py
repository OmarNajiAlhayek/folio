"""Shared Bearer auth for Folio backend API TestSprite tests."""

from __future__ import annotations

import requests

DEFAULT_TIMEOUT = 30

def minimal_draft_payload(*, suffix: str = "") -> dict:
    label = suffix or "draft"
    return {
        "title": f"TestSprite API {label}",
        "titleAr": "مسودة اختبار",
        "abstract": "Minimal abstract for automated API testing.",
        "abstractAr": "ملخص اختبار آلي.",
        "articleType": "original_research",
        "keywords": "testing, api, folio",
        "keywordsAr": "اختبار, واجهة, منصة, مجلة, بحث",
        "contributors": [
            {
                "fullName": "Test Author",
                "affiliation": "Folio University",
                "sortOrder": 0,
                "isCorresponding": True,
            }
        ],
        "originalityConfirmed": True,
        "conflictOfInterestStatement": "None declared.",
        "ethicalApprovalReference": "N/A",
        "aiUsageStatement": "No generative AI used.",
    }


def minimal_constructor_content(*, title: str) -> dict:
    return {
        "defaultDir": "ltr",
        "sections": [
            {
                "id": "title-1",
                "kind": "title",
                "text": title,
                "dir": "ltr",
                "dirSource": "manual",
            },
            {
                "id": "abstract-en",
                "kind": "abstract",
                "lang": "en",
                "text": "Minimal abstract for automated API testing.",
                "dir": "ltr",
                "dirSource": "manual",
            },
            {
                "id": "abstract-ar",
                "kind": "abstract",
                "lang": "ar",
                "text": "ملخص اختبار آلي.",
                "dir": "rtl",
                "dirSource": "manual",
            },
            {
                "id": "refs-1",
                "kind": "references",
                "items": [{"lang": "en", "html": "<p>Author. Title. 2024.</p>"}],
                "dir": "ltr",
                "dirSource": "manual",
            },
        ],
    }


EDITOR_EMAIL = "k76462338@gmail.com"
EDITOR_PASSWORD = "Editor123!"
REVIEWER_EMAIL = "ysryrwthqsdthwy@gmail.com"
REVIEWER_PASSWORD = "Reviewer123!"


def login_bearer(
    base_url: str,
    email: str,
    password: str,
    *,
    timeout: int = DEFAULT_TIMEOUT,
) -> requests.Session:
    """Login via POST /api/v1/auth/login and attach Authorization: Bearer."""
    session = requests.Session()
    session.headers.update({"Accept": "application/json"})
    resp = session.post(
        f"{base_url.rstrip('/')}/api/v1/auth/login",
        json={"email": email, "password": password},
        timeout=timeout,
    )
    if resp.status_code != 200:
        raise AssertionError(
            f"Login failed: expected HTTP 200, got {resp.status_code}: {resp.text}"
        )
    data = resp.json()
    token = data.get("accessToken")
    if not token:
        raise AssertionError(
            "Login response missing accessToken — set AUTH_RETURN_BEARER=true on the backend"
        )
    session.headers["Authorization"] = f"Bearer {token}"
    return session


def ensure_invited_assignment_slug(
    reviewer_session: requests.Session,
    base_url: str,
) -> str:
    """Return an invited assignment slug, creating one via editor if needed."""
    api = f"{base_url.rstrip('/')}/api/v1"
    assignments = reviewer_session.get(f"{api}/assignments/me", timeout=DEFAULT_TIMEOUT)
    assignments.raise_for_status()
    invited = next(
        (a for a in assignments.json() if a.get("status") == "invited"),
        None,
    )
    if invited:
        return invited["slug"]

    reviewer_me = reviewer_session.get(f"{api}/auth/me", timeout=DEFAULT_TIMEOUT)
    reviewer_me.raise_for_status()
    reviewer_id = reviewer_me.json().get("id")
    assert reviewer_id, "Reviewer profile missing id"

    editor_session = login_bearer(base_url, EDITOR_EMAIL, EDITOR_PASSWORD)
    submissions = editor_session.get(f"{api}/submissions", timeout=DEFAULT_TIMEOUT)
    submissions.raise_for_status()
    under_review = [
        s for s in submissions.json() if s.get("status") == "under_review"
    ]
    assert under_review, "No under_review submission available for reviewer invite"

    for candidate in under_review:
        assign_resp = editor_session.post(
            f"{api}/submissions/{candidate['slug']}/assignments",
            json={"reviewerId": reviewer_id},
            timeout=DEFAULT_TIMEOUT,
        )
        if assign_resp.status_code in (200, 201):
            return assign_resp.json()["slug"]

    refreshed = reviewer_session.get(f"{api}/assignments/me", timeout=DEFAULT_TIMEOUT)
    refreshed.raise_for_status()
    invited = next(
        (a for a in refreshed.json() if a.get("status") == "invited"),
        None,
    )
    assert invited, (
        "Could not create or find an invited assignment for the reviewer"
    )
    return invited["slug"]


def ensure_accepted_assignment_slug(
    reviewer_session: requests.Session,
    base_url: str,
) -> str:
    """Return an accepted assignment slug, accepting an invite when needed."""
    api = f"{base_url.rstrip('/')}/api/v1"
    assignments_resp = reviewer_session.get(
        f"{api}/assignments/me", timeout=DEFAULT_TIMEOUT
    )
    assignments_resp.raise_for_status()
    assignments = assignments_resp.json()

    invited = next(
        (a for a in assignments if a.get("status") == "invited"),
        None,
    )
    if invited:
        slug = invited["slug"]
        accept_resp = reviewer_session.post(
            f"{api}/assignments/{slug}/accept",
            timeout=DEFAULT_TIMEOUT,
        )
        assert accept_resp.status_code == 200, (
            f"Failed to accept assignment {slug}: {accept_resp.status_code}"
        )
        return slug

    accepted = next(
        (a for a in assignments if a.get("status") == "accepted"),
        None,
    )
    if accepted:
        return accepted["slug"]

    slug = ensure_invited_assignment_slug(reviewer_session, base_url)
    accept_resp = reviewer_session.post(
        f"{api}/assignments/{slug}/accept",
        timeout=DEFAULT_TIMEOUT,
    )
    assert accept_resp.status_code == 200, (
        f"Failed to accept assignment {slug}: {accept_resp.status_code}"
    )
    return slug
