import { NextResponse } from "next/server";
import { generateOperationalAlerts } from "@/lib/alerts";
import { requireAdminApi } from "@/lib/guards";

export async function POST() {
  const admin = await requireAdminApi();
  if ("error" in admin) return admin.error;

  const result = await generateOperationalAlerts();
  return NextResponse.json(result);
}
