-- Second migration: SLA tracking and the open-request view.
-- Proves migration ordering against local D1 (0001 then 0002).

ALTER TABLE requests ADD COLUMN due_at TEXT;
ALTER TABLE requests ADD COLUMN sla_breached INTEGER NOT NULL DEFAULT 0;
ALTER TABLE requests ADD COLUMN resolved_at TEXT;

CREATE INDEX idx_requests_due_at ON requests(due_at);

CREATE VIEW v_open_requests AS
SELECT
  r.id,
  r.title,
  r.category,
  r.priority,
  r.status,
  r.due_at,
  r.created_at,
  r.updated_at,
  ru.name AS requester_name,
  au.name AS assignee_name,
  CASE
    WHEN r.due_at IS NOT NULL
      AND r.status NOT IN ('resolved', 'rejected')
      AND r.due_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    THEN 1
    ELSE 0
  END AS is_overdue
FROM requests r
JOIN users ru ON ru.id = r.requester_id
LEFT JOIN users au ON au.id = r.assignee_id
WHERE r.status NOT IN ('resolved', 'rejected');
