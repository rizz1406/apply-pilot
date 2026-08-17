INSERT OR REPLACE INTO tailored_resumes (id, job_id, profile_snapshot, jd_hash, resume_json, audit_json, keyword_coverage, match_score, latex_content, status, model)
VALUES ('tailored:test', 'integration:test-job', '{}', 'hash', '{"summary":"Synthetic"}', '{"verdict":"pass"}', '{"pct":80}', 80, 'latex', 'audit_pass', 'test');

INSERT OR REPLACE INTO applications (id, job_id, stage, resume_variant, cover_letter, screening_answers, tailored_resume_id)
VALUES ('application:test', 'integration:test-job', 'prepared', 'Data Analyst', 'Synthetic letter', '{}', 'tailored:test');

SELECT a.id, a.stage, t.match_score, t.status, length(t.latex_content) AS latex_length
FROM applications a LEFT JOIN tailored_resumes t ON t.id = a.tailored_resume_id
WHERE a.id = 'application:test';
