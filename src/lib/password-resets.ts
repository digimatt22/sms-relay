import { query, transaction } from "@/lib/db";
import { createMessage } from "@/lib/messages";
import { createPasswordResetCode, hashPassword, verifyPassword } from "@/lib/security";
import { getPlatformName } from "@/lib/branding";

const RESET_CODE_LIFETIME_MINUTES = 15;
const RESET_CODE_MAX_ATTEMPTS = 5;
const RESET_REQUEST_COOLDOWN_SECONDS = 60;
const RESET_REQUEST_MAX_PER_HOUR = 5;

export async function requestPasswordReset(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const userResult = await query<{
    id: string;
    mobile_number: string | null;
    organization_id: string | null;
  }>(
    `SELECT u.id,
            u.mobile_number,
            COALESCE(
              u.default_organization_id,
              (
                SELECT m.organization_id
                  FROM organization_memberships m
                 WHERE m.user_id = u.id
                 ORDER BY m.created_at ASC
                 LIMIT 1
              )
            ) AS organization_id
       FROM admin_users u
      WHERE u.email = $1`,
    [normalizedEmail]
  );
  const user = userResult.rows[0];
  if (!user?.mobile_number || !user.organization_id) return;

  const limits = await query<{ total: number; recent: number }>(
    `SELECT COUNT(*) FILTER (WHERE created_at >= now() - interval '1 hour')::int AS total,
            COUNT(*) FILTER (WHERE created_at >= now() - ($2::int * interval '1 second'))::int AS recent
       FROM password_reset_codes
      WHERE user_id = $1`,
    [user.id, RESET_REQUEST_COOLDOWN_SECONDS]
  );
  if (limits.rows[0]?.recent || Number(limits.rows[0]?.total || 0) >= RESET_REQUEST_MAX_PER_HOUR) return;

  const code = createPasswordResetCode();
  const reset = await transaction(async (db) => {
    await db.query(
      `UPDATE password_reset_codes
          SET used_at = now()
        WHERE user_id = $1
          AND used_at IS NULL`,
      [user.id]
    );
    const result = await db.query<{ id: string }>(
      `INSERT INTO password_reset_codes (user_id, organization_id, code_hash, expires_at)
       VALUES ($1, $2, $3, now() + ($4::int * interval '1 minute'))
       RETURNING id`,
      [user.id, user.organization_id, hashPassword(code), RESET_CODE_LIFETIME_MINUTES]
    );
    return result.rows[0];
  });

  try {
    const message = await createMessage({
      to: user.mobile_number,
      body: `${getPlatformName()} password reset code: ${code}. It expires in ${RESET_CODE_LIFETIME_MINUTES} minutes.`,
      priority: 10,
      metadata: {
        systemType: "password_reset",
        passwordResetId: reset.id
      },
      organizationId: user.organization_id,
      userId: user.id,
      submittedVia: "dashboard",
      messageCategory: "security",
      authorizationExempt: true
    });
    await query("UPDATE password_reset_codes SET message_id = $1 WHERE id = $2", [message.id, reset.id]);
  } catch {
    await query("UPDATE password_reset_codes SET used_at = now() WHERE id = $1", [reset.id]);
  }
}

export async function resetPasswordWithCode(input: { email: string; code: string; password: string }) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const normalizedCode = input.code.replace(/\D/g, "");

  return transaction(async (db) => {
    const result = await db.query<{
      id: string;
      user_id: string;
      code_hash: string;
      attempts: number;
    }>(
      `SELECT r.id, r.user_id, r.code_hash, r.attempts
         FROM password_reset_codes r
         JOIN admin_users u ON u.id = r.user_id
        WHERE u.email = $1
          AND r.used_at IS NULL
          AND r.expires_at > now()
        ORDER BY r.created_at DESC
        LIMIT 1
        FOR UPDATE OF r`,
      [normalizedEmail]
    );
    const reset = result.rows[0];
    if (!reset || reset.attempts >= RESET_CODE_MAX_ATTEMPTS) return false;

    if (!verifyPassword(normalizedCode, reset.code_hash)) {
      await db.query(
        `UPDATE password_reset_codes
            SET attempts = attempts + 1,
                used_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE used_at END
          WHERE id = $1`,
        [reset.id, RESET_CODE_MAX_ATTEMPTS]
      );
      return false;
    }

    await db.query(
      `UPDATE admin_users
          SET password_hash = $1,
              must_change_password = false,
              mobile_number_verified_at = COALESCE(mobile_number_verified_at, now()),
              password_changed_at = now(),
              updated_at = now()
        WHERE id = $2`,
      [hashPassword(input.password), reset.user_id]
    );
    await db.query(
      `UPDATE password_reset_codes
          SET used_at = now()
        WHERE user_id = $1
          AND used_at IS NULL`,
      [reset.user_id]
    );
    return true;
  });
}
