import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from folio_api_session import login_bearer

BASE_URL = "http://localhost:5240"
ASSIGNMENTS_ME_URL = f"{BASE_URL}/api/v1/assignments/me"

USERNAME = "reviewer@folio.dev"
PASSWORD = "Reviewer123!"
TIMEOUT = 30


def test_get_api_v1_assignments_me_with_authenticated_reviewer():
    session = login_bearer(BASE_URL, USERNAME, PASSWORD)

    assignments_resp = session.get(ASSIGNMENTS_ME_URL, timeout=TIMEOUT)
    assert assignments_resp.status_code == 200, (
        f"Expected status 200 on assignments/me, got {assignments_resp.status_code}"
    )

    assignments = assignments_resp.json()
    assert isinstance(assignments, list), (
        "Expected response to be a list (ReviewAssignment array)"
    )
    if assignments:
        assert isinstance(assignments[0], dict), (
            "Expected each ReviewAssignment to be a dict/object"
        )


test_get_api_v1_assignments_me_with_authenticated_reviewer()
