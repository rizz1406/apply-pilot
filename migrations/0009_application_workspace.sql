CREATE TABLE application_answers (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  verified INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE interview_workspaces (
  application_id TEXT PRIMARY KEY REFERENCES applications(id) ON DELETE CASCADE,
  scheduled_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  prep_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE jobs ADD COLUMN risk_flags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE jobs ADD COLUMN duplicate_key TEXT;
CREATE INDEX IF NOT EXISTS jobs_duplicate_key_idx ON jobs(duplicate_key);
