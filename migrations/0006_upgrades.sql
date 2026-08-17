ALTER TABLE settings ADD COLUMN active_from TEXT;
ALTER TABLE settings ADD COLUMN freshness_hours INTEGER NOT NULL DEFAULT 72;
ALTER TABLE settings ADD COLUMN minimum_match_score INTEGER NOT NULL DEFAULT 65;
ALTER TABLE settings ADD COLUMN browser_notifications INTEGER NOT NULL DEFAULT 0;

CREATE TABLE external_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL CHECK (provider IN ('ashby','smartrecruiters')),
  organization TEXT NOT NULL,
  label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_scanned_at TEXT,
  last_error TEXT,
  UNIQUE(provider, organization)
);

CREATE TABLE resume_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  target_titles TEXT NOT NULL,
  filename TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO resume_variants (name, target_titles, filename, is_default) VALUES
('Data Analyst', 'Data Analyst,Reporting Analyst,Digital Analytics Analyst', 'RizwanBaig_job_switch.pdf', 1),
('BI Analyst', 'Business Intelligence Analyst,BI Analyst,Power BI Analyst', 'RizwanBaig_job_switch.pdf', 0),
('Junior Data Engineer', 'Junior Data Engineer,Data Engineer I,Junior Analytics Engineer,Analytics Engineer', 'RizwanBaig_job_switch.pdf', 0);

CREATE TABLE recruiter_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  source_url TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, email)
);

CREATE INDEX recruiter_contacts_job_idx ON recruiter_contacts(job_id);
