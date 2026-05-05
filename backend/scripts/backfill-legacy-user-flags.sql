-- One-time upgrade if your DB still has is_editor / is_reviewer on users.
-- Run AFTER RBAC tables and seed exist (roles + permissions rows).
-- Then remove legacy columns manually or let TypeORM synchronize drop them.

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
CROSS JOIN roles r
WHERE r.slug = 'author'
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id
  );

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.slug = 'editor'
WHERE u.is_editor = true
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = r.id
  );

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.slug = 'reviewer'
WHERE u.is_reviewer = true
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.role_id = r.id
  );

-- Optional: ALTER TABLE users DROP COLUMN is_editor, DROP COLUMN is_reviewer;
