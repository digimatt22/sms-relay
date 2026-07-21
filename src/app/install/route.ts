import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export async function GET() {
  const installer = await readFile(path.join(process.cwd(), "install", "gateway-install.sh"), "utf8");
  return new NextResponse(installer, {
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}
