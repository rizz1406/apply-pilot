CREATE TABLE job_leads (
  id TEXT PRIMARY KEY,
  gmail_message_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  subject TEXT,
  url TEXT NOT NULL UNIQUE,
  received_at TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','opened','imported','skipped')),
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX job_leads_status_idx ON job_leads(status, discovered_at DESC);

CREATE TABLE integration_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
