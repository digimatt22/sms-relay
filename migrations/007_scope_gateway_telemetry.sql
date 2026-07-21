ALTER TABLE gateway_logs
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE gateway_health
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE gateway_logs l
   SET organization_id = COALESCE(
     organization_id,
     (SELECT organization_id FROM gateways g WHERE g.id = l.gateway_id),
     '00000000-0000-0000-0000-000000000001'
   );

UPDATE gateway_health h
   SET organization_id = COALESCE(
     organization_id,
     (SELECT organization_id FROM gateways g WHERE g.id = h.gateway_id),
     '00000000-0000-0000-0000-000000000001'
   );

ALTER TABLE gateway_logs
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE gateway_health
  ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS gateway_logs_org_created_idx
  ON gateway_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS gateway_health_org_created_idx
  ON gateway_health (organization_id, created_at DESC);
