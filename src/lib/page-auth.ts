import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasRole, type Role } from "@/lib/rbac";
import { mustChangePassword } from "@/lib/passwords";

export async function requireAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (await mustChangePassword(session.user.id)) redirect("/change-password");
  return session;
}

export async function requireRolePage(minimumRole: Role) {
  const session = await requireAdminPage();
  if (!hasRole(session, minimumRole)) redirect("/messages");
  return session;
}
