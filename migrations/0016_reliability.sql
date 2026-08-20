CREATE TABLE source_scan_runs (
  id TEXT PRIMARY KEY,
  source_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  label TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('success','failed')),
  attempts INTEGER NOT NULL DEFAULT 1,
  jobs_seen INTEGER NOT NULL DEFAULT 0,
  new_matches INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX source_scan_runs_source_idx ON source_scan_runs(source_key, created_at DESC);

CREATE TABLE task_runs (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX task_runs_type_idx ON task_runs(task_type, started_at DESC);

CREATE TABLE app_notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX app_notifications_unread_idx ON app_notifications(read_at, created_at DESC);

CREATE TABLE accuracy_evaluations (
  id TEXT PRIMARY KEY,
  suite_name TEXT NOT NULL,
  total INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  accuracy REAL NOT NULL,
  precision_score REAL NOT NULL,
  recall_score REAL NOT NULL,
  false_positives INTEGER NOT NULL,
  false_negatives INTEGER NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE document_versions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  tailored_resume_id TEXT REFERENCES tailored_resumes(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  checksum TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(application_id, kind, version_number)
);

CREATE INDEX document_versions_application_idx ON document_versions(application_id, created_at DESC);

INSERT INTO document_versions (id, application_id, tailored_resume_id, kind, version_number, content, mime_type, created_at)
SELECT lower(hex(randomblob(16))), application_id, tailored_resume_id, kind, 1, content, mime_type, created_at
FROM application_documents;
