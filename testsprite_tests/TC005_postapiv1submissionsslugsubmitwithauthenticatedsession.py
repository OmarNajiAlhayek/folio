import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from folio_api_session import (
    login_bearer,
    minimal_constructor_content,
    minimal_draft_payload,
)

BASE_URL = "http://localhost:5240"
API_BASE = f"{BASE_URL}/api/v1"

AUTHOR_EMAIL = "author@folio.dev"
AUTHOR_PASSWORD = "Author123!"


def test_post_api_v1_submissions_slug_submit_with_authenticated_session():
    session = login_bearer(BASE_URL, AUTHOR_EMAIL, AUTHOR_PASSWORD)
    timeout = 30
    suffix = uuid.uuid4().hex[:8]
    draft_payload = minimal_draft_payload(suffix=suffix)

    create_resp = session.post(
        f"{API_BASE}/submissions",
        json=draft_payload,
        timeout=timeout,
    )
    assert create_resp.status_code == 201, (
        f"Draft creation failed with status {create_resp.status_code}: {create_resp.text}"
    )
    submission_slug = create_resp.json().get("slug")
    assert submission_slug, "Created submission missing slug"

    submit_resp = session.post(
        f"{API_BASE}/submissions/{submission_slug}/submit",
        json={
            "presentConstructorManuscript": True,
            "constructorContent": minimal_constructor_content(
                title=draft_payload["title"]
            ),
        },
        timeout=timeout,
    )
    assert submit_resp.status_code == 200, (
        f"Submission submit failed with status {submit_resp.status_code}: {submit_resp.text}"
    )

    submission = submit_resp.json()
    assert isinstance(submission, dict), "Submission submit response is not a dict"
    assert submission.get("slug") == submission_slug, "Returned submission slug does not match"
    assert submission.get("status") == "submitted", (
        f"Submission status not updated to 'submitted', is '{submission.get('status')}'"
    )


test_post_api_v1_submissions_slug_submit_with_authenticated_session()
