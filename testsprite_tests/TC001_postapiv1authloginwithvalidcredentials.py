import requests

BASE_URL = "http://localhost:5240"
LOGIN_API_PATH = "/api/v1/auth/login"
TIMEOUT = 30

def test_postapiv1authloginwithvalidcredentials():
    url = f"{BASE_URL}{LOGIN_API_PATH}"
    headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    }
    payload = {
        "email": "editor@folio.dev",
        "password": "Editor123!"
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"HTTP request failed: {e}"

    assert response.status_code == 200, f"Expected HTTP 200, got {response.status_code}"

    try:
        json_data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    user = json_data.get("user")
    assert isinstance(user, dict), "Response JSON missing 'user' object"
    email = user.get("email")
    assert isinstance(email, str) and email, "'user.email' missing or empty in response"
    assert email.lower() == payload["email"].lower(), (
        f"user.email {email!r} does not match login email {payload['email']!r}"
    )

    cookies = response.cookies
    assert cookies, "Response cookies are missing"
    assert len(cookies) > 0, "No cookies set in response after login"


test_postapiv1authloginwithvalidcredentials()