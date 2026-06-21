import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from folio_api_session import login_bearer

BASE_URL = "http://localhost:5240"
API_ME_ENDPOINT = f"{BASE_URL}/api/v1/auth/me"

USERNAME = "k76462338@gmail.com"
PASSWORD = "Editor123!"


def test_get_api_v1_auth_me_with_authenticated_session():
    session = login_bearer(BASE_URL, USERNAME, PASSWORD)
    try:
        me_resp = session.get(API_ME_ENDPOINT, timeout=30)
        assert me_resp.status_code == 200, f"Expected status 200 but got {me_resp.status_code}"
        json_data = me_resp.json()
        assert isinstance(json_data, dict), "Response JSON is not a dictionary"
        assert "email" in json_data, "User email field missing in response"
        assert (
            json_data["email"].lower() == USERNAME.lower()
        ), f"User email {json_data['email']} does not match login email {USERNAME}"
    finally:
        session.close()


test_get_api_v1_auth_me_with_authenticated_session()
