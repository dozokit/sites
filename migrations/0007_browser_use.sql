-- Browser Run time the builder used, per UTC day, for the usage panel: Cloudflare has no API for it.
CREATE TABLE browser_use (day TEXT PRIMARY KEY, ms INTEGER NOT NULL);
