ALTER TABLE applications ADD COLUMN submission_status TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE applications ADD COLUMN confirmation_source TEXT;
ALTER TABLE applications ADD COLUMN confirmation_confidence REAL;
ALTER TABLE applications ADD COLUMN last_verified_at TEXT;

ALTER TABLE settings ADD COLUMN ai_daily_budget INTEGER NOT NULL DEFAULT 4;
ALTER TABLE settings ADD COLUMN feedback_learning_enabled INTEGER NOT NULL DEFAULT 1;

CREATE TABLE job_feedback (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE REFERENCES jobs(id) ON DELETE CASCADE,
  relevance INTEGER NOT NULL CHECK(relevance IN (-1, 1)),
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE preference_weights (
  feature_key TEXT PRIMARY KEY,
  positive_count INTEGER NOT NULL DEFAULT 0,
  negative_count INTEGER NOT NULL DEFAULT 0,
  weight REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE application_events (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  evidence TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX application_events_application_idx ON application_events(application_id, created_at DESC);

CREATE TABLE task_queue (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','succeeded','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_until TEXT,
  dedupe_key TEXT UNIQUE,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX task_queue_due_idx ON task_queue(status, next_attempt_at);

CREATE TABLE ai_usage (
  usage_date TEXT NOT NULL,
  provider TEXT NOT NULL,
  operation TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (usage_date, provider, operation)
);

CREATE TABLE job_project_selections (
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL REFERENCES verified_evidence(id) ON DELETE CASCADE,
  relevance_score INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  selected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (job_id, evidence_id)
);

CREATE TABLE ats_sources (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('workable','recruitee','careerpage')),
  organization TEXT NOT NULL,
  label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_scanned_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, organization)
);

CREATE INDEX ats_sources_enabled_idx ON ats_sources(enabled, provider);
