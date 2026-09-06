import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from folio_api_session import login_bearer

BASE_URL = "http://localhost:5240"
API_BASE = f"{BASE_URL}/api/v1"

USERNAME = "editor@folio.dev"
PASSWORD = "Editor123!"


def test_get_notifications_with_authenticated_session():
    session = login_bearer(BASE_URL, USERNAME, PASSWORD)
    try:
        notifications_resp = session.get(f"{API_BASE}/notifications", timeout=30)
        assert notifications_resp.status_code == 200, (
            f"Failed to fetch notifications, status code {notifications_resp.status_code}, "
            f"response: {notifications_resp.text}"
        )

        notifications_json = notifications_resp.json()
        assert isinstance(notifications_json, dict), (
            "NotificationPage response should be a dict"
        )
        assert "items" in notifications_json and isinstance(
            notifications_json["items"], list
        ), "NotificationPage missing 'items' list"

        if "total" in notifications_json:
            assert (
                isinstance(notifications_json["total"], int)
                and notifications_json["total"] >= 0
            )
        if "page" in notifications_json:
            assert (
                isinstance(notifications_json["page"], int)
                and notifications_json["page"] >= 1
            )
        if "pageSize" in notifications_json:
            assert (
                isinstance(notifications_json["pageSize"], int)
                and notifications_json["pageSize"] >= 1
            )
    finally:
        session.close()


test_get_notifications_with_authenticated_session()
