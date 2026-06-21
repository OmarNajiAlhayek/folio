import requests
import uuid

BASE_URL = "http://localhost:5240"
REGISTER_ENDPOINT = "/api/v1/auth/register"

def test_postapiv1authregisterwithvaliddata():
    # Generate unique email to avoid conflicts
    unique_email = f"testuser_{uuid.uuid4().hex[:8]}@example.com"
    password = "StrongP@ssword123"
    display_name = "Test User"

    url = BASE_URL + REGISTER_ENDPOINT
    headers = {
        "Content-Type": "application/json"
    }
    payload = {
        "email": unique_email,
        "password": password,
        "displayName": display_name
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        assert response.status_code == 201, f"Expected status 201 but got {response.status_code}"
        data = response.json()
        assert "user" in data, "Response JSON missing 'user' key"
        user = data["user"]
        assert isinstance(user, dict), "'user' value is not a dict"
        assert user.get("email") == unique_email, f"User email mismatch: expected {unique_email}, got {user.get('email')}"
        # Additional possible assertions can be added here if AuthUser schema is known
    finally:
        # Cleanup: delete the created user if delete endpoint existed.
        # Since no delete user API described, skip cleanup.
        pass

test_postapiv1authregisterwithvaliddata()