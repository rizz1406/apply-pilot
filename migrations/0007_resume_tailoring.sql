CREATE TABLE master_resume_profiles (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  profile_json TEXT NOT NULL,
  source_name TEXT NOT NULL,
  verified_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO master_resume_profiles (id, profile_json, source_name, verified_at) VALUES (1, '{"name":"Rizwan Baig","title":"Data Analyst","email":"rizwanmirza95551@gmail.com","phone":"+91 8096863836","location":"Hyderabad, Telangana","linkedin":"https://www.linkedin.com/in/rizwanbaig001/","github":"https://github.com/rizz1406","website":"https://rizz1406.github.io/","summary":"Data Analyst with production experience owning analytics reporting, ETL pipelines, dashboards and data quality workflows for a major digital media client.","skills":"BigQuery, SQL, GA4, Google Ad Manager, Looker Studio, Power BI, Excel, Google Sheets, Python, GCP, ETL, data QA, query optimization","experience":[{"role":"Data Analyst","company":"DataBeat","location":"Hyderabad, Client: TIME","dates":"Jun 2025 - Present","bullets":["Designed and delivered an automated Google Ad Manager inventory forecasting pipeline.","Owned client dashboards, BigQuery datasets and ETL pipelines through development, QA, deployment and monitoring.","Built production SQL across Bronze, Silver and Gold warehouse layers and resolved reporting discrepancies across GA4, GAM and BigQuery.","Optimized SQL cost and execution time through partitioning, clustering and CTE refactoring.","Automated data quality checks and repetitive analyst tasks with Python and AI tooling."]},{"role":"Data Researcher Intern","company":"Collegedunia","location":"Remote","dates":"Dec 2024 - May 2025","bullets":["Built solution PDFs with LaTeX and AI tools and researched educational data at 95 percent accuracy."]}],"projects":[{"name":"Superstore Sales Analysis and Forecasting","tech":"SQL, Power BI","link":"https://github.com/rizz1406/Superstore-Sales-Analysis","bullets":["Analyzed sales data, built interactive dashboards and forecast 15-day sales for inventory planning."]},{"name":"Galaxy Store Sales Analysis","tech":"Excel","link":"https://github.com/rizz1406/My-Galaxy-Store-Sales-Analysis","bullets":["Cleaned and analyzed sales data to identify buyer demographics, revenue states and promotional opportunities."]}],"education":[{"degree":"B.Tech, Computer Science and Design","school":"St. Martin''s Engineering College","location":"Hyderabad, Telangana","dates":"2021 - 2025"}],"certifications":["Accenture Data Analytics","Cisco Data Analytics Essentials","PwC Power BI"]}', 'RizwanBaig_job_switch.pdf', CURRENT_TIMESTAMP);

CREATE TABLE tailored_resumes (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  profile_snapshot TEXT NOT NULL,
  jd_hash TEXT NOT NULL,
  resume_json TEXT NOT NULL,
  audit_json TEXT NOT NULL DEFAULT '{}',
  keyword_coverage TEXT NOT NULL DEFAULT '{}',
  match_score INTEGER,
  latex_content TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','audit_pass','review','approved')),
  model TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, jd_hash)
);

CREATE INDEX tailored_resumes_job_idx ON tailored_resumes(job_id, updated_at DESC);

ALTER TABLE applications ADD COLUMN tailored_resume_id TEXT;

CREATE TABLE application_documents (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  tailored_resume_id TEXT NOT NULL REFERENCES tailored_resumes(id),
  kind TEXT NOT NULL CHECK (kind IN ('latex','json','cover_letter')),
  content TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(application_id, kind)
);
