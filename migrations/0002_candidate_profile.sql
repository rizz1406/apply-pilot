CREATE TABLE candidate_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  full_name TEXT,
  email TEXT,
  phone TEXT,
  home_location TEXT,
  linkedin_url TEXT,
  portfolio_url TEXT,
  current_title TEXT,
  years_experience REAL,
  education TEXT,
  verified_skills TEXT NOT NULL DEFAULT '[]',
  evidence TEXT NOT NULL DEFAULT '[]',
  target_recommendations TEXT NOT NULL DEFAULT '[]',
  work_authorization TEXT,
  sponsorship_required INTEGER,
  notice_period TEXT,
  minimum_salary INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO candidate_profile (id) VALUES (1);
