PRAGMA foreign_keys = ON;

CREATE TABLE settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  target_role TEXT NOT NULL DEFAULT 'Software Engineer',
  alternate_titles TEXT NOT NULL DEFAULT 'Frontend Engineer,Full Stack Engineer,Software Engineer II',
  preferred_locations TEXT NOT NULL DEFAULT 'Remote,New York,NY',
  required_skills TEXT NOT NULL DEFAULT 'JavaScript,TypeScript,React,Node.js',
  excluded_keywords TEXT NOT NULL DEFAULT 'unpaid,commission only',
  minimum_salary INTEGER,
  daily_application_limit INTEGER NOT NULL DEFAULT 8,
  require_approval INTEGER NOT NULL DEFAULT 1,
  followups_enabled INTEGER NOT NULL DEFAULT 1,
  followup_days INTEGER NOT NULL DEFAULT 5,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO settings (id) VALUES (1);

CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL CHECK (provider IN ('greenhouse', 'lever')),
  organization TEXT NOT NULL,
  label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_scanned_at TEXT,
  last_error TEXT,
  UNIQUE(provider, organization)
);

CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  external_id TEXT NOT NULL,
  source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  location TEXT,
  workplace_type TEXT,
  description TEXT,
  apply_url TEXT NOT NULL,
  salary_text TEXT,
  published_at TEXT,
  discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  score INTEGER NOT NULL DEFAULT 0,
  score_reasons TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','shortlisted','skipped','approved','expired')),
  UNIQUE(provider, external_id)
);

CREATE INDEX jobs_status_score_idx ON jobs(status, score DESC);
CREATE INDEX jobs_discovered_idx ON jobs(discovered_at DESC);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  stage TEXT NOT NULL DEFAULT 'approved' CHECK (stage IN ('approved','prepared','applied','outreach','interview','offer','rejected','withdrawn')),
  resume_variant TEXT,
  cover_letter TEXT,
  screening_answers TEXT NOT NULL DEFAULT '{}',
  submitted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id)
);

CREATE INDEX applications_stage_idx ON applications(stage, updated_at DESC);

CREATE TABLE outreach (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  recruiter_name TEXT,
  recruiter_email TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  thread_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','sent','replied','cancelled')),
  followup_number INTEGER NOT NULL DEFAULT 0,
  scheduled_for TEXT,
  sent_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX outreach_due_idx ON outreach(status, scheduled_for);

CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  message TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX activity_created_idx ON activity_log(created_at DESC);
