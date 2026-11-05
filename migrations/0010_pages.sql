-- Visitors' pages, drawn once when the site is published (path: language and address, like
-- fr/ or en/services). key says what they were drawn from: the published version, the analytics
-- connection and the photo descriptions; a visit whose key differs draws the page itself.
CREATE TABLE pages (
  site_id INTEGER NOT NULL,
  path TEXT NOT NULL,
  key TEXT NOT NULL,
  html TEXT NOT NULL,
  PRIMARY KEY (site_id, path)
);
