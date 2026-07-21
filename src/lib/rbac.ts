import { NextResponse } from "next/server";
import type { Session } from "next-auth";

export type Role = "platform_admin" | "org_admin" | "operator" | "viewer";

const roleRank: Record<Role, number> = {
  viewer: 0,
  operator: 1,
  org_admin: 2,
  platform_admin: 3
};

export function normalizeRole(role?: string | null): Role {
  if (role === "platform_admin" || role === "org_admin" || role === "operator" || role === "viewer") {
    return role;
  }
  if (role === "admin") return "platform_admin";
  return "viewer";
}

export function hasRole(session: Session | null | undefined, minimumRole: Role) {
  return roleRank[normalizeRole(session?.user?.role)] >= roleRank[minimumRole];
}

export function forbiddenResponse() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
