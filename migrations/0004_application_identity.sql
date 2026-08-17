ALTER TABLE candidate_profile ADD COLUMN current_role_start TEXT;
ALTER TABLE candidate_profile ADD COLUMN internship_start TEXT;
ALTER TABLE candidate_profile ADD COLUMN internship_end TEXT;
ALTER TABLE candidate_profile ADD COLUMN github_url TEXT;
ALTER TABLE candidate_profile ADD COLUMN preferred_industries TEXT NOT NULL DEFAULT '[]';
ALTER TABLE candidate_profile ADD COLUMN demographic_response TEXT DEFAULT 'Prefer not to say';
ALTER TABLE candidate_profile ADD COLUMN resume_filename TEXT;
ALTER TABLE candidate_profile ADD COLUMN resume_local_path TEXT;
