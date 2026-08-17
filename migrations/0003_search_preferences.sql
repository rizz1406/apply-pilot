ALTER TABLE candidate_profile ADD COLUMN experience_at_search REAL;
ALTER TABLE candidate_profile ADD COLUMN work_modes TEXT NOT NULL DEFAULT '["remote","hybrid","on-site"]';
ALTER TABLE candidate_profile ADD COLUMN employment_types TEXT NOT NULL DEFAULT '["full-time"]';
ALTER TABLE candidate_profile ADD COLUMN willing_to_relocate INTEGER NOT NULL DEFAULT 0;
ALTER TABLE candidate_profile ADD COLUMN target_salary INTEGER;
ALTER TABLE candidate_profile ADD COLUMN stretch_salary INTEGER;
