CREATE TABLE verified_evidence (
  id TEXT PRIMARY KEY,
  evidence_type TEXT NOT NULL CHECK (evidence_type IN ('experience','project','certification','skill','achievement')),
  title TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  source_url TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX verified_evidence_active_idx ON verified_evidence(active, verified, evidence_type);

CREATE TABLE resume_versions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  tailored_resume_id TEXT NOT NULL REFERENCES tailored_resumes(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  instruction TEXT NOT NULL DEFAULT '',
  resume_json TEXT NOT NULL,
  audit_json TEXT NOT NULL DEFAULT '{}',
  keyword_coverage TEXT NOT NULL DEFAULT '{}',
  latex_content TEXT,
  model TEXT,
  change_summary TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(application_id, version_number)
);

CREATE INDEX resume_versions_application_idx ON resume_versions(application_id, version_number DESC);

CREATE TABLE application_checklist (
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,
  label TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (application_id, item_key)
);

CREATE INDEX application_checklist_status_idx ON application_checklist(application_id, completed);

INSERT INTO resume_versions (id, application_id, tailored_resume_id, version_number, instruction, resume_json, audit_json, keyword_coverage, latex_content, model, change_summary, created_at)
SELECT lower(hex(randomblob(16))), a.id, t.id, 1, 'Initial tailored resume', t.resume_json, t.audit_json, t.keyword_coverage, t.latex_content, t.model,
  '{"changed":[],"summary":"Initial saved resume."}', t.created_at
FROM applications a JOIN tailored_resumes t ON t.id = a.tailored_resume_id;

INSERT INTO application_checklist (application_id, item_key, label, required, completed, completed_at)
SELECT id, 'jd_reviewed', 'Full job description reviewed', 1, 1, updated_at FROM applications;
INSERT INTO application_checklist (application_id, item_key, label, required, completed, completed_at)
SELECT id, 'resume_tailored', 'Tailored resume generated and audited', 1, CASE WHEN tailored_resume_id IS NOT NULL THEN 1 ELSE 0 END, CASE WHEN tailored_resume_id IS NOT NULL THEN updated_at END FROM applications;
INSERT INTO application_checklist (application_id, item_key, label, required, completed, completed_at)
SELECT id, 'resume_approved', 'Resume approved', 1, CASE WHEN stage IN ('approved','applied','outreach','interview','offer','rejected') THEN 1 ELSE 0 END, CASE WHEN stage IN ('approved','applied','outreach','interview','offer','rejected') THEN updated_at END FROM applications;
INSERT INTO application_checklist (application_id, item_key, label, required, completed)
SELECT id, 'screening_answers', 'Portal screening answers reviewed', 1, 0 FROM applications;
INSERT INTO application_checklist (application_id, item_key, label, required, completed, completed_at)
SELECT id, 'submitted', 'Official application submitted', 1, CASE WHEN submitted_at IS NOT NULL OR stage IN ('applied','outreach','interview','offer','rejected') THEN 1 ELSE 0 END, submitted_at FROM applications;
INSERT INTO application_checklist (application_id, item_key, label, required, completed)
SELECT id, 'confirmation', 'Submission confirmation received', 0, 0 FROM applications;
INSERT INTO application_checklist (application_id, item_key, label, required, completed)
SELECT id, 'followup', 'Recruiter follow-up scheduled', 0, CASE WHEN EXISTS (SELECT 1 FROM outreach o WHERE o.application_id = applications.id AND o.status != 'cancelled') THEN 1 ELSE 0 END FROM applications;
