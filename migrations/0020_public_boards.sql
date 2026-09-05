-- Widen the sources provider CHECK to allow public boards (Remote OK, We Work Remotely)
-- alongside the existing per-company Greenhouse/Lever sources.
PRAGMA foreign_keys=off;

CREATE TABLE sources_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL CHECK (provider IN ('greenhouse', 'lever', 'remoteok', 'weworkremotely')),
  organization TEXT NOT NULL,
  label TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_scanned_at TEXT,
  last_error TEXT,
  UNIQUE(provider, organization)
);

INSERT INTO sources_new (id, provider, organization, label, enabled, last_scanned_at, last_error)
SELECT id, provider, organization, label, enabled, last_scanned_at, last_error FROM sources;

DROP TABLE sources;
ALTER TABLE sources_new RENAME TO sources;

PRAGMA foreign_keys=on;
