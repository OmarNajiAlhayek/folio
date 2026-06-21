import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from folio_api_session import (
    REVIEWER_EMAIL,
    REVIEWER_PASSWORD,
    ensure_invited_assignment_slug,
    login_bearer,
)

BASE_URL = "http://localhost:5240"
ACCEPT_ASSIGNMENT_URL_TEMPLATE = f"{BASE_URL}/api/v1/assignments/{{slug}}/accept"


def postapiv1assignmentsslugacceptwithauthenticatedreviewer():
    session = login_bearer(BASE_URL, REVIEWER_EMAIL, REVIEWER_PASSWORD)
    assignment_slug = ensure_invited_assignment_slug(session, BASE_URL)

    accept_url = ACCEPT_ASSIGNMENT_URL_TEMPLATE.format(slug=assignment_slug)
    accept_resp = session.post(accept_url, timeout=30)
    assert accept_resp.status_code == 200, (
        f"Accept assignment failed with status {accept_resp.status_code}"
    )
    accepted_assignment = accept_resp.json()
    assert accepted_assignment.get("slug") == assignment_slug, (
        "Returned assignment slug does not match"
    )
    status = accepted_assignment.get("status") or accepted_assignment.get("state") or ""
    assert "accepted" in status.lower(), f"Assignment status is not accepted: {status}"


postapiv1assignmentsslugacceptwithauthenticatedreviewer()
