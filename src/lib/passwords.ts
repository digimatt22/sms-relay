import { query } from "@/lib/db";

export async function mustChangePassword(userId: string) {
  const result = await query<{ must_change_password: boolean }>(
    "SELECT must_change_password FROM admin_users WHERE id = $1",
    [userId]
  );
  return result.rows[0]?.must_change_password === true;
}
