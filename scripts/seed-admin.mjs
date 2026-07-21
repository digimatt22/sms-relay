import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const email = process.env.ADMIN_EMAIL || "mwood@digicolony.com";
const password = process.env.ADMIN_PASSWORD || "change-me-now";
const name = process.env.ADMIN_NAME || "Matthew Wood";

if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

function hashPassword(value) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(value, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

const pool = new Pool({ connectionString: databaseUrl });

try {
  await pool.query(
    `INSERT INTO admin_users (email, name, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, 'platform_admin', true)
     ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           must_change_password = true,
           password_changed_at = NULL,
           updated_at = now()`,
    [email.toLowerCase(), name, hashPassword(password)]
  );
  console.log(`Seeded admin user ${email}`);
} finally {
  await pool.end();
}
