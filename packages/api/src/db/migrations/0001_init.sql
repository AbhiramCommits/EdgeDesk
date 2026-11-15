-- EdgeDesk initial relational schema.
-- All timestamps are ISO-8601 TEXT (UTC) so they sort lexically.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('employee', 'people_ops', 'admin')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE requests (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT CHECK (
    category IN ('equipment', 'onboarding', 'policy', 'access', 'payroll', 'other')
  ),
  priority TEXT CHECK (priority IN ('p0', 'p1', 'p2', 'p3')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (
    status IN ('new', 'triaging', 'awaiting_info', 'in_progress', 'resolved', 'rejected')
  ),
  assignee_id TEXT REFERENCES users(id),
  resolution TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE agent_runs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'finished', 'failed')),
  triage_category TEXT CHECK (
    triage_category IN ('equipment', 'onboarding', 'policy', 'access', 'payroll', 'other')
  ),
  triage_priority TEXT CHECK (triage_priority IN ('p0', 'p1', 'p2', 'p3')),
  confidence REAL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER
);

CREATE TABLE agent_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES agent_runs(id),
  seq INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('plan', 'tool', 'outcome', 'error')),
  tool_name TEXT,
  input_json TEXT NOT NULL DEFAULT '{}',
  output_json TEXT NOT NULL DEFAULT '{}',
  ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_requests_status ON requests(status);
CREATE INDEX idx_requests_category ON requests(category);
CREATE INDEX idx_requests_created_at ON requests(created_at);
CREATE INDEX idx_agent_runs_request_id ON agent_runs(request_id);
CREATE INDEX idx_agent_steps_run_id ON agent_steps(run_id);
CREATE INDEX idx_audit_events_entity_id ON audit_events(entity_id);
