import { query } from "@/lib/db";

type ReadinessQuery = (text: string) => Promise<unknown>;

export type ReadinessResult =
  | { status: 200; body: { status: "ready" } }
  | { status: 503; body: { status: "unavailable" } };

export async function checkDatabaseReadiness(
  runQuery: ReadinessQuery = query,
): Promise<ReadinessResult> {
  try {
    await runQuery("SELECT 1");
    return { status: 200, body: { status: "ready" } };
  } catch {
    return { status: 503, body: { status: "unavailable" } };
  }
}
