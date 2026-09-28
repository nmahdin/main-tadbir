-- Read-only deployment checks. Run only in the host's authenticated database panel.
-- Never automatically grant admin based on the legacy role_key column.

-- Must be >= 1 before rollout. Review permissions attached to this real role too.
SELECT COUNT(*) AS active_admins
FROM users u JOIN roles r ON r.id = u.role_id
WHERE u.status = 'active' AND r.`key` = 'admin' AND r.is_active = 1;

-- Review explicitly: unresolved identities fail closed after rollout.
SELECT u.id AS user_id, u.role_id, u.role_key AS legacy_key,
       r.`key` AS canonical_key, u.status, r.is_active AS role_active
FROM users u LEFT JOIN roles r ON r.id = u.role_id
WHERE r.id IS NULL OR NOT (u.role_key <=> r.`key`);

-- Count only; do not export private chat payloads for diagnostics.
SELECT COUNT(*) AS conversations_without_member_array
FROM domain_records
WHERE domain = 'conversation'
  AND (JSON_EXTRACT(payload, '$.memberIds') IS NULL
       OR JSON_TYPE(JSON_EXTRACT(payload, '$.memberIds')) <> 'ARRAY');

SELECT COUNT(*) AS orphan_chat_messages
FROM domain_records m LEFT JOIN domain_records c
  ON c.id = m.parent_id AND c.domain = 'conversation'
WHERE m.domain = 'chat_message' AND c.id IS NULL;
