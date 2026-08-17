ALTER TABLE settings ADD COLUMN tailoring_minimum_score INTEGER NOT NULL DEFAULT 75;
ALTER TABLE settings ADD COLUMN must_have_skills TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS applications_submitted_idx ON applications(submitted_at DESC);
CREATE INDEX IF NOT EXISTS recruiter_contacts_email_idx ON recruiter_contacts(email);
