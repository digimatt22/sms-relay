import { NextResponse } from "next/server";
import { checkDatabaseReadiness } from "@/lib/readiness";

export async function GET() {
  const result = await checkDatabaseReadiness();
  return NextResponse.json(result.body, { status: result.status });
}
