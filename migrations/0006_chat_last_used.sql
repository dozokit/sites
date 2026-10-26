-- When each chat app last called the builder, so "connected" means it still uses it.
ALTER TABLE oauth_clients ADD COLUMN last_used INTEGER;
UPDATE oauth_clients SET last_used = (SELECT max(created_at) FROM oauth_tokens t WHERE t.client_id = oauth_clients.id);
