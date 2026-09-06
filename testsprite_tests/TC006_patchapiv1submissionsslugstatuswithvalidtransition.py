import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from folio_api_session import login_bearer

BASE_URL = "http://localhost:5240"
SUBMISSIONS_API = f"{BASE_URL}/api/v1/submissions"
TIMEOUT = 30

EDITOR_EMAIL = "editor@folio.dev"
EDITOR_PASSWORD = "Editor123!"


def test_patch_api_v1_submissions_slug_status_with_valid_transition():
    session = login_bearer(BASE_URL, EDITOR_EMAIL, EDITOR_PASSWORD)
    try:
        submissions_resp = session.get(SUBMISSIONS_API, timeout=TIMEOUT)
        submissions_resp.raise_for_status()
        submissions = submissions_resp.json()
        assert isinstance(submissions, list), "Expected submissions list for editor"

        submitted = next(
            (s for s in submissions if s.get("status") == "submitted"),
            None,
        )
        assert submitted, "No submitted submission found for editor status transition"
        submission_slug = submitted.get("slug")
        assert submission_slug, "Submission missing slug"

        patch_payload = {"status": "under_review"}
        patch_resp = session.patch(
            f"{SUBMISSIONS_API}/{submission_slug}/status",
            json=patch_payload,
            timeout=TIMEOUT,
        )
        assert patch_resp.status_code == 200, (
            f"Expected 200 on PATCH status, got {patch_resp.status_code}"
        )
        updated_submission = patch_resp.json()
        assert updated_submission.get("status") == "under_review", (
            "Submission status did not update to under_review"
        )
    finally:
        session.close()


test_patch_api_v1_submissions_slug_status_with_valid_transition()
