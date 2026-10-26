-- Each site's photo library: what the owner uploaded, what was imported from their old site, and
-- what the site uses. The files themselves are in the IMAGES store under the same id.
CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  site_id INTEGER NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL, -- upload, website or page
  created_at INTEGER NOT NULL
);
CREATE INDEX photos_site ON photos (site_id, created_at);
