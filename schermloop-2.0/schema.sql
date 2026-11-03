CREATE TABLE IF NOT EXISTS organizations (
 id uuid PRIMARY KEY,
 name text NOT NULL,
 user_limit integer NOT NULL DEFAULT 1 CHECK (user_limit >= 1),
 screen_limit integer NOT NULL DEFAULT 1 CHECK (screen_limit >= 1),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY,
 organization_id uuid REFERENCES organizations(id),
 email text NOT NULL UNIQUE,
 password_hash text NOT NULL,
 role text NOT NULL CHECK (role IN ('superadmin','owner','staff')),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS screens (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name text NOT NULL,
 device_hash text UNIQUE,
 device_version integer NOT NULL DEFAULT 0,
 session_hash text,
 session_started_at timestamptz,
 last_seen_at timestamptz,
 settings jsonb NOT NULL DEFAULT '{"enabled":false,"days":[1,2,3,4,5],"on":"07:30","off":"18:00","clock":true,"background":"black"}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pairing_requests (
 id uuid PRIMARY KEY,
 code_hash text UNIQUE NOT NULL,
 claim_hash text NOT NULL,
 encrypted_device_token text,
 paired_screen_id uuid REFERENCES screens(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 claimed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS items (
 id uuid PRIMARY KEY,
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 screen_id uuid NOT NULL REFERENCES screens(id) ON DELETE CASCADE,
 title text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('image','video','text')),
 text_body text,
 storage_key text,
 mime text,
 duration integer NOT NULL DEFAULT 10 CHECK(duration BETWEEN 2 AND 600),
 enabled boolean NOT NULL DEFAULT true,
 position integer NOT NULL DEFAULT 0,
 settings jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_screens_org ON screens(organization_id);
CREATE INDEX IF NOT EXISTS idx_items_screen ON items(screen_id,position,created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_pair_exp ON pairing_requests(expires_at);

-- Additieve migratie: bestaande installaties krijgen dezelfde sessiekolommen.
ALTER TABLE screens ADD COLUMN IF NOT EXISTS session_hash text;
ALTER TABLE screens ADD COLUMN IF NOT EXISTS session_started_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS idx_screens_session_hash ON screens(session_hash) WHERE session_hash IS NOT NULL;
