import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import pg from "pg";

const connectionString =
  process.env.DATABASE_EVIDENCE_URL || process.env.DATABASE_URL;
const outputPath = process.argv[2];

if (!connectionString) throw new Error("DATABASE_EVIDENCE_URL or DATABASE_URL is required");

const pool = new pg.Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 10_000,
});

const PROTECTED_TABLES = [
  "admin_users",
  "alerts",
  "api_client_gateway_pool_access",
  "api_client_keys",
  "api_clients",
  "callback_deliveries",
  "consent_disclosure_versions",
  "conversation_threads",
  "daily_usage_rollups",
  "delivery_receipts",
  "gateway_access",
  "gateway_commands",
  "gateway_keys",
  "gateway_pool_memberships",
  "gateway_pools",
  "gateways",
  "inbound_messages",
  "message_attempts",
  "message_events",
  "messages",
  "messaging_programs",
  "mobile_verification_codes",
  "opt_outs",
  "organization_memberships",
  "organization_plans",
  "organizations",
  "password_reset_codes",
  "plans",
  "platform_events",
  "platform_suppressions",
  "pricing_leads",
  "recipient_authorization_events",
  "recipient_authorizations",
  "schema_migrations",
  "user_invitations",
  "verification_challenges",
  "verification_template_versions",
  "webhook_subscriptions",
];

async function rows(sql) {
  return (await pool.query(sql)).rows;
}

try {
  const [metadata] = await rows(`
    SELECT current_database() AS database,
           current_user AS connected_role,
           current_setting('server_version_num')::int AS version_num,
           current_setting('server_version') AS version,
           pg_encoding_to_char(encoding) AS encoding,
           datcollate AS collation,
           datctype AS ctype,
           pg_get_userbyid(datdba) AS database_owner,
           pg_is_in_recovery() AS recovery
      FROM pg_database
     WHERE datname = current_database()
  `);
  const ledger = await rows(
    "SELECT filename FROM schema_migrations ORDER BY filename",
  );
  const tables = await rows(`
    SELECT tablename
      FROM pg_tables
     WHERE schemaname = 'public'
     ORDER BY tablename
  `);
  const counts = {};
  for (const { tablename } of tables) {
    const result = await pool.query(
      `SELECT count(*)::bigint AS count FROM ${pg.escapeIdentifier(tablename)}`,
    );
    counts[tablename] = result.rows[0].count;
  }

  const schemaParts = {
    columns: await rows(`
      SELECT table_name, ordinal_position, column_name, data_type, udt_name,
             is_nullable, column_default
        FROM information_schema.columns
       WHERE table_schema = 'public'
       ORDER BY table_name, ordinal_position
    `),
    constraints: await rows(`
      SELECT c.conrelid::regclass::text AS table_name, c.conname, c.contype,
             pg_get_constraintdef(c.oid, true) AS definition
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE n.nspname = 'public'
       ORDER BY table_name, c.conname
    `),
    indexes: await rows(`
      SELECT t.relname AS table_name, i.relname AS index_name,
             pg_get_indexdef(i.oid) AS definition
        FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid
        JOIN pg_class t ON t.oid = x.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'public'
       ORDER BY t.relname, i.relname
    `),
    enums: await rows(`
      SELECT t.typname AS type_name, e.enumsortorder, e.enumlabel
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public'
       ORDER BY t.typname, e.enumsortorder
    `),
    extensions: await rows(`
      SELECT extname, extversion
        FROM pg_extension
       ORDER BY extname
    `),
  };
  const schemaSha256 = createHash("sha256")
    .update(JSON.stringify(schemaParts))
    .digest("hex");

  const [relationships] = await rows(`
    SELECT
      (SELECT count(*) FROM messages m
        LEFT JOIN organizations o ON o.id = m.organization_id
       WHERE o.id IS NULL)::int AS orphan_messages_organization,
      (SELECT count(*) FROM messages m
        LEFT JOIN messaging_programs p
          ON p.id = m.messaging_program_id
         AND p.organization_id = m.organization_id
       WHERE m.messaging_program_id IS NOT NULL AND p.id IS NULL)::int
        AS orphan_messages_program,
      (SELECT count(*) FROM recipient_authorizations a
        LEFT JOIN messaging_programs p
          ON p.id = a.messaging_program_id
         AND p.organization_id = a.organization_id
       WHERE p.id IS NULL)::int AS orphan_authorizations_program,
      (SELECT count(*) FROM api_client_keys k
        LEFT JOIN api_clients c ON c.id = k.api_client_id
       WHERE c.id IS NULL)::int AS orphan_api_keys,
      (SELECT count(*) FROM message_attempts a
        LEFT JOIN messages m ON m.id = a.message_id
       WHERE m.id IS NULL)::int AS orphan_attempts,
      (SELECT count(*) FROM delivery_receipts r
        LEFT JOIN messages m ON m.id = r.message_id
       WHERE r.message_id IS NOT NULL AND m.id IS NULL)::int AS orphan_receipts,
      (SELECT count(*) FROM conversation_threads c
        LEFT JOIN organizations o ON o.id = c.organization_id
       WHERE o.id IS NULL)::int AS orphan_conversations,
      (SELECT count(*) FROM recipient_authorization_events e
        LEFT JOIN recipient_authorizations a
          ON a.id = e.recipient_authorization_id
       WHERE a.id IS NULL)::int AS orphan_authorization_events
  `);
  const roles = await rows(`
    SELECT r.rolname, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
           r.rolinherit, r.rolreplication, r.rolconnlimit,
           (SELECT count(*)::int
              FROM pg_class c
             WHERE c.relowner = r.oid
               AND c.relnamespace = 'public'::regnamespace) AS owned_objects
      FROM pg_roles r
     WHERE r.rolname IN ('relayhub_sms_owner', 'relayhub_sms_runtime')
     ORDER BY r.rolname
  `);
  const schemaOwners = await rows(`
    SELECT n.nspname, r.rolname AS owner
      FROM pg_namespace n
      JOIN pg_roles r ON r.oid = n.nspowner
     WHERE n.nspname = 'public'
  `);

  const snapshot = {
    captured_at: new Date().toISOString(),
    metadata,
    ledger: ledger.map(({ filename }) => filename),
    table_counts: counts,
    protected_table_counts: Object.fromEntries(
      PROTECTED_TABLES.map((table) => [table, counts[table]]),
    ),
    relationships,
    schema: {
      sha256: schemaSha256,
      table_count: tables.length,
      extension_versions: schemaParts.extensions,
    },
    roles,
    schema_owners: schemaOwners,
  };
  const rendered = `${JSON.stringify(snapshot, null, 2)}\n`;
  if (outputPath) {
    await writeFile(outputPath, rendered, { mode: 0o600 });
  } else {
    process.stdout.write(rendered);
  }
} finally {
  await pool.end();
}
