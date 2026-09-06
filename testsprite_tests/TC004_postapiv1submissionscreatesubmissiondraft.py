import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import uuid

from folio_api_session import login_bearer, minimal_draft_payload

BASE_URL = "http://localhost:5240"
SUBMISSIONS_URL = f"{BASE_URL}/api/v1/submissions"

AUTHOR_EMAIL = "author@folio.dev"
AUTHOR_PASSWORD = "Author123!"


def test_postapiv1submissionscreatesubmissiondraft():
    session = login_bearer(BASE_URL, AUTHOR_EMAIL, AUTHOR_PASSWORD)
    response = session.post(
        SUBMISSIONS_URL,
        json=minimal_draft_payload(suffix=uuid.uuid4().hex[:8]),
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    assert response.status_code == 201, (
        f"Submission draft creation failed: {response.status_code} {response.text}"
    )

    submission = response.json()
    assert isinstance(submission, dict), "Submission draft response is not a JSON object"
    assert (
        "slug" in submission
        and isinstance(submission["slug"], str)
        and submission["slug"]
    ), "Submission slug missing or invalid"
    assert (
        submission.get("status") == "draft" or "status" not in submission
    ), "Submission status is not draft or missing"


test_postapiv1submissionscreatesubmissiondraft()
