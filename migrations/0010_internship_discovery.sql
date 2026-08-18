ALTER TABLE settings ADD COLUMN internship_titles TEXT NOT NULL DEFAULT 'Data Analyst Intern,Business Intelligence Intern,Data Engineering Intern,Analytics Intern';
ALTER TABLE jobs ADD COLUMN opportunity_type TEXT NOT NULL DEFAULT 'full_time';
CREATE INDEX IF NOT EXISTS jobs_opportunity_type_idx ON jobs(opportunity_type, status, score DESC);
