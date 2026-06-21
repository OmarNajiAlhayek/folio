import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from folio_api_session import (
    REVIEWER_EMAIL,
    REVIEWER_PASSWORD,
    ensure_accepted_assignment_slug,
    login_bearer,
)

BASE_URL = "http://localhost:5240"
TIMEOUT = 30

def test_postapiv1assignmentsslugreviewswithvaliddata():
    session = login_bearer(BASE_URL, REVIEWER_EMAIL, REVIEWER_PASSWORD)
    assignment_slug = ensure_accepted_assignment_slug(session, BASE_URL)

    review_data = {
        "recommendation": "accept",
        "commentsForAuthor": "Well-written paper with novel findings.",
        "commentsToEditorOnly": "No conflicts of interest detected.",
    }

    resp = session.post(
        f"{BASE_URL}/api/v1/assignments/{assignment_slug}/reviews",
        json=review_data,
        timeout=TIMEOUT,
    )
    assert resp.status_code == 201, f"Expected 201 Created but got {resp.status_code}"
    review = resp.json()
    assert isinstance(review, dict), "Review response is not a JSON object"
    assert "id" in review or "reviewId" in review, "Review ID missing in response"
    assert review.get("recommendation") == review_data["recommendation"], (
        "Recommendation mismatch"
    )
    assert review.get("commentsForAuthor") == review_data["commentsForAuthor"], (
        "Comments for author mismatch"
    )
    assert review.get("commentsToEditorOnly") == review_data["commentsToEditorOnly"], (
        "Comments to editor mismatch"
    )


test_postapiv1assignmentsslugreviewswithvaliddata()
