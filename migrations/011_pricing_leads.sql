UPDATE plans
   SET display_price = CASE slug
     WHEN 'starter' THEN '$49/mo'
     WHEN 'growth' THEN '$199/mo'
     WHEN 'scale' THEN '$699/mo'
     ELSE display_price
   END,
   updated_at = now()
 WHERE slug IN ('starter', 'growth', 'scale');

CREATE TABLE IF NOT EXISTS pricing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  company text,
  plan_slug text REFERENCES plans(slug) ON DELETE SET NULL,
  notes text,
  source text NOT NULL DEFAULT 'pricing',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
