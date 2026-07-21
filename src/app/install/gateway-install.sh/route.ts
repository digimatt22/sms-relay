import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export async function GET() {
  const script = await readFile(path.join(process.cwd(), "install", "gateway-install.sh"), "utf8");
  return new NextResponse(script, {
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
