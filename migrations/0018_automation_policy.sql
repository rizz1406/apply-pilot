ALTER TABLE settings ADD COLUMN automation_mode TEXT NOT NULL DEFAULT 'approval';
ALTER TABLE settings ADD COLUMN auto_apply_min_score INTEGER NOT NULL DEFAULT 88;
ALTER TABLE settings ADD COLUMN approval_min_score INTEGER NOT NULL DEFAULT 65;
ALTER TABLE settings ADD COLUMN auto_apply_daily_limit INTEGER NOT NULL DEFAULT 3;
ALTER TABLE settings ADD COLUMN trusted_companies TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN blocked_companies TEXT NOT NULL DEFAULT '';

ALTER TABLE jobs ADD COLUMN automation_decision TEXT NOT NULL DEFAULT 'unclassified';
ALTER TABLE jobs ADD COLUMN automation_reasons TEXT NOT NULL DEFAULT '[]';
ALTER TABLE jobs ADD COLUMN automation_capability TEXT NOT NULL DEFAULT '{}';
ALTER TABLE jobs ADD COLUMN automation_decided_at TEXT;

ALTER TABLE applications ADD COLUMN automation_mode TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE applications ADD COLUMN idempotency_key TEXT;
ALTER TABLE applications ADD COLUMN needs_input_reason TEXT;

CREATE UNIQUE INDEX applications_idempotency_idx ON applications(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX jobs_automation_queue_idx ON jobs(automation_decision, score DESC, discovered_at DESC);

CREATE TABLE submission_attempts (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','processing','needs_input','submitted','confirmed','failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  request_summary TEXT NOT NULL DEFAULT '{}',
  response_summary TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX submission_attempts_application_idx ON submission_attempts(application_id, attempted_at DESC);
