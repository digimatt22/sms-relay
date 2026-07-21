import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/guards";
import { runMaintenanceJobs } from "@/lib/maintenance";

export async function POST() {
  const admin = await requireAdminApi();
  if ("error" in admin) return admin.error;

  const result = await runMaintenanceJobs();
  return NextResponse.json(result);
}
