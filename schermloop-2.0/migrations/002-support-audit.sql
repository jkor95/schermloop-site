-- SchermLoop 2.0 - verantwoorde supportregistratie
CREATE TABLE IF NOT EXISTS support_events (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  target_kind text NOT NULL,
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_events_company_time ON support_events(organization_id, created_at DESC);
