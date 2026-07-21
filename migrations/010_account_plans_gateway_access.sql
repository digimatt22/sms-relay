CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  monthly_message_limit integer NOT NULL,
  included_users integer NOT NULL,
  included_api_keys integer NOT NULL,
  included_gateways integer NOT NULL DEFAULT 0,
  private_gateway_allowed boolean NOT NULL DEFAULT false,
  callback_allowed boolean NOT NULL DEFAULT false,
  log_retention_days integer NOT NULL DEFAULT 90,
  support_level text NOT NULL DEFAULT 'standard',
  display_price text NOT NULL DEFAULT 'Contact us',
  is_public boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO plans (
  slug, name, description, monthly_message_limit, included_users, included_api_keys,
  included_gateways, private_gateway_allowed, callback_allowed, log_retention_days,
  support_level, display_price, sort_order
)
VALUES
  ('starter', 'Starter', 'Low-usage SMS relay for small teams and pilots.', 1000, 1, 2, 0, false, false, 30, 'standard', '$49/mo placeholder', 10),
  ('growth', 'Growth', 'Mid-usage SMS operations with more users and integrations.', 10000, 5, 5, 1, true, true, 90, 'priority', '$199/mo placeholder', 20),
  ('scale', 'Scale', 'High-usage relay operations with dedicated gateway visibility.', 50000, 20, 15, 3, true, true, 180, 'priority', '$699/mo placeholder', 30)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name,
      description = EXCLUDED.description,
      monthly_message_limit = EXCLUDED.monthly_message_limit,
      included_users = EXCLUDED.included_users,
      included_api_keys = EXCLUDED.included_api_keys,
      included_gateways = EXCLUDED.included_gateways,
      private_gateway_allowed = EXCLUDED.private_gateway_allowed,
      callback_allowed = EXCLUDED.callback_allowed,
      log_retention_days = EXCLUDED.log_retention_days,
      support_level = EXCLUDED.support_level,
      display_price = EXCLUDED.display_price,
      sort_order = EXCLUDED.sort_order,
      updated_at = now();

CREATE TABLE IF NOT EXISTS organization_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active',
  starts_at timestamptz NOT NULL DEFAULT now(),
  renews_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id)
);

INSERT INTO organization_plans (organization_id, plan_id, status)
SELECT o.id, p.id, 'active'
  FROM organizations o
  JOIN plans p ON p.slug = 'scale'
ON CONFLICT (organization_id) DO NOTHING;

ALTER TABLE gateways
  ADD COLUMN IF NOT EXISTS owner_organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'shared';

UPDATE gateways
   SET owner_organization_id = COALESCE(owner_organization_id, organization_id),
       visibility = CASE
         WHEN visibility IS NULL THEN 'client_owned'
         WHEN visibility = 'shared' AND organization_id = '00000000-0000-0000-0000-000000000001' THEN 'shared'
         ELSE visibility
       END;

CREATE TABLE IF NOT EXISTS gateway_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway_id uuid NOT NULL REFERENCES gateways(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  access_level text NOT NULL DEFAULT 'status_only',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway_id, organization_id)
);

INSERT INTO gateway_access (gateway_id, organization_id, access_level)
SELECT g.id,
       COALESCE(g.owner_organization_id, g.organization_id),
       CASE WHEN g.visibility = 'shared' THEN 'status_only' ELSE 'manage' END
  FROM gateways g
ON CONFLICT (gateway_id, organization_id) DO UPDATE
  SET access_level = EXCLUDED.access_level,
      updated_at = now();

CREATE INDEX IF NOT EXISTS organization_plans_org_status_idx
  ON organization_plans (organization_id, status);

CREATE INDEX IF NOT EXISTS gateway_access_org_level_idx
  ON gateway_access (organization_id, access_level);

CREATE INDEX IF NOT EXISTS gateways_owner_visibility_idx
  ON gateways (owner_organization_id, visibility);
