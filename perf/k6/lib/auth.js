import http from 'k6/http';
import { check } from 'k6';

/**
 * @param {string} baseUrl
 * @param {string} email
 * @param {string} password
 */
export function loginBearer(baseUrl, email, password) {
  const res = http.post(
    `${baseUrl}/auth/login`,
    JSON.stringify({ email, password }),
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      tags: { endpoint: 'auth_login' },
    },
  );
  check(res, {
    'login status 2xx': (r) => r.status === 200 || r.status === 201,
  });
  if (res.status !== 200 && res.status !== 201) {
    return null;
  }
  const body = res.json();
  return body.accessToken || null;
}
