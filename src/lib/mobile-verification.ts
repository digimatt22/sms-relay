import { query, transaction } from "@/lib/db";
import { createMessage } from "@/lib/messages";
import { createPasswordResetCode, hashPassword, verifyPassword } from "@/lib/security";
import { getPlatformName } from "@/lib/branding";

const VERIFICATION_CODE_LIFETIME_MINUTES = 15;
const VERIFICATION_CODE_MAX_ATTEMPTS = 5;
const VERIFICATION_REQUEST_COOLDOWN_SECONDS = 60;
const VERIFICATION_REQUEST_MAX_PER_HOUR = 5;

export async function requestMobileVerificationForEmail(email: string) {
  const result = await query<{ id: string; organization_id: string | null }>(
    `SELECT u.id,
            COALESCE(
              u.default_organization_id,
              (SELECT m.organization_id FROM organization_memberships m WHERE m.user_id = u.id ORDER BY m.created_at ASC LIMIT 1)
            ) AS organization_id
       FROM admin_users u
      WHERE u.email = $1
        AND u.mobile_number IS NOT NULL
        AND u.mobile_number_verified_at IS NULL`,
    [email.trim().toLowerCase()]
  );
  const user = result.rows[0];
  if (user?.organization_id) await requestMobileVerification(user.id, user.organization_id);
}

export async function requestMobileVerification(userId: string, organizationId: string) {
  const userResult = await query<{ mobile_number: string | null; mobile_number_verified_at: Date | null }>(
    "SELECT mobile_number, mobile_number_verified_at FROM admin_users WHERE id = $1",
    [userId]
  );
  const user = userResult.rows[0];
  if (!user?.mobile_number || user.mobile_number_verified_at) return;

  const limits = await query<{ total: number; recent: number }>(
    `SELECT COUNT(*) FILTER (WHERE created_at >= now() - interval '1 hour')::int AS total,
            COUNT(*) FILTER (WHERE created_at >= now() - ($2::int * interval '1 second'))::int AS recent
       FROM mobile_verification_codes
      WHERE user_id = $1`,
    [userId, VERIFICATION_REQUEST_COOLDOWN_SECONDS]
  );
  if (limits.rows[0]?.recent || Number(limits.rows[0]?.total || 0) >= VERIFICATION_REQUEST_MAX_PER_HOUR) return;

  const code = createPasswordResetCode();
  const verification = await transaction(async (db) => {
    await db.query("UPDATE mobile_verification_codes SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [userId]);
    const result = await db.query<{ id: string }>(
      `INSERT INTO mobile_verification_codes (user_id, organization_id, code_hash, expires_at)
       VALUES ($1, $2, $3, now() + ($4::int * interval '1 minute'))
       RETURNING id`,
      [userId, organizationId, hashPassword(code), VERIFICATION_CODE_LIFETIME_MINUTES]
    );
    return result.rows[0];
  });

  try {
    const message = await createMessage({
      to: user.mobile_number,
      body: `${getPlatformName()} mobile verification code: ${code}. It expires in ${VERIFICATION_CODE_LIFETIME_MINUTES} minutes.`,
      priority: 10,
      metadata: {
        systemType: "mobile_verification",
        mobileVerificationId: verification.id
      },
      organizationId,
      userId,
      submittedVia: "dashboard",
      messageCategory: "security",
      authorizationExempt: true
    });
    await query("UPDATE mobile_verification_codes SET message_id = $1 WHERE id = $2", [message.id, verification.id]);
  } catch {
    await query("UPDATE mobile_verification_codes SET used_at = now() WHERE id = $1", [verification.id]);
  }
}

export async function verifyMobileCode(input: { email: string; code: string }) {
  const email = input.email.trim().toLowerCase();
  const code = input.code.replace(/\D/g, "");
  return transaction(async (db) => {
    const result = await db.query<{ id: string; user_id: string; code_hash: string; attempts: number }>(
      `SELECT v.id, v.user_id, v.code_hash, v.attempts
         FROM mobile_verification_codes v
         JOIN admin_users u ON u.id = v.user_id
        WHERE u.email = $1
          AND u.mobile_number_verified_at IS NULL
          AND v.used_at IS NULL
          AND v.expires_at > now()
        ORDER BY v.created_at DESC
        LIMIT 1
        FOR UPDATE OF v`,
      [email]
    );
    const verification = result.rows[0];
    if (!verification || verification.attempts >= VERIFICATION_CODE_MAX_ATTEMPTS) return false;
    if (!verifyPassword(code, verification.code_hash)) {
      await db.query(
        `UPDATE mobile_verification_codes
            SET attempts = attempts + 1,
                used_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE used_at END
          WHERE id = $1`,
        [verification.id, VERIFICATION_CODE_MAX_ATTEMPTS]
      );
      return false;
    }
    await db.query("UPDATE admin_users SET mobile_number_verified_at = now(), updated_at = now() WHERE id = $1", [verification.user_id]);
    await db.query("UPDATE mobile_verification_codes SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [verification.user_id]);
    return true;
  });
}
