-- Several sites in one builder. The first site is served at the root of the Worker's address,
-- the others at /<slug>/ until they get a domain of their own. Existing rows belong to site 1.
CREATE TABLE sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  domain TEXT UNIQUE,
  published INTEGER,
  analytics_site TEXT,
  created_at INTEGER NOT NULL
);

ALTER TABLE versions ADD COLUMN site_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE messages ADD COLUMN site_id INTEGER NOT NULL DEFAULT 1;
ALTER TABLE usage ADD COLUMN site_id INTEGER;
CREATE INDEX versions_site ON versions (site_id, id);
CREATE INDEX messages_site ON messages (site_id, id);

-- A builder that already had its site keeps it as site 1, published as before.
INSERT INTO sites (id, slug, published, analytics_site, created_at)
SELECT 1, 'site',
  (SELECT CAST(value AS INTEGER) FROM settings WHERE key = 'published'),
  (SELECT value FROM settings WHERE key = 'analytics_site'),
  (SELECT MIN(created_at) FROM versions)
WHERE EXISTS (SELECT 1 FROM versions);
UPDATE usage SET site_id = 1 WHERE EXISTS (SELECT 1 FROM sites WHERE id = 1);
