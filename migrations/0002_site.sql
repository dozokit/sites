-- Every saved state of the site. The newest row is the draft; settings.published points at the
-- row visitors see. Undo is going back one row. `via` says who made it: ai, owner (typed it),
-- or start (the first site).
CREATE TABLE versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc TEXT NOT NULL,
  note TEXT NOT NULL,
  via TEXT NOT NULL,
  usage_id INTEGER,
  created_at INTEGER NOT NULL
);

-- One row per call to the owner's AI, with what OpenRouter said it cost. Calls that change
-- nothing (an answer, a recipe) are here too.
CREATE TABLE usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  cost REAL NOT NULL,
  created_at INTEGER NOT NULL
);

-- What visitors send through the contact form.
CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  body TEXT NOT NULL,
  lang TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Typed in the admin page: ai_key, model_write, model_edit, published, analytics_url,
-- analytics_site.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
