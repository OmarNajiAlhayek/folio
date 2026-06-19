import { check } from 'k6';

export function check2xx(res, name = 'status 2xx') {
  return check(res, {
    [name]: (r) => r.status >= 200 && r.status < 300,
  });
}

export function checkJsonArray(res, name = 'json array') {
  return check(res, {
    [name]: (r) => {
      try {
        const body = r.json();
        return Array.isArray(body);
      } catch {
        return false;
      }
    },
  });
}

export function checkJsonObject(res, name = 'json object') {
  return check(res, {
    [name]: (r) => {
      try {
        const body = r.json();
        return body !== null && typeof body === 'object' && !Array.isArray(body);
      } catch {
        return false;
      }
    },
  });
}

/** Paginated list shape: `{ items: [...], nextCursor? }`. */
export function checkJsonListResult(res, name = 'json list result') {
  return check(res, {
    [`${name} 2xx`]: (r) => r.status >= 200 && r.status < 300,
    [`${name} items array`]: (r) => {
      try {
        const body = r.json();
        return Array.isArray(body?.items);
      } catch {
        return false;
      }
    },
  });
}
