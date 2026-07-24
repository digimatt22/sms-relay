import { NextResponse, type NextRequest } from "next/server";
import {
  isWriteFenceEnabled,
  shouldBlockWrite,
} from "@/lib/write-fence";

export function proxy(request: NextRequest) {
  const fenceEnabled = isWriteFenceEnabled();
  if (shouldBlockWrite(request.method, fenceEnabled)) {
    const headers = {
      "cache-control": "no-store",
      "retry-after": "60",
      "x-relayhub-write-fence": "active",
    };
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Service temporarily read-only" },
        { status: 503, headers },
      );
    }
    return new NextResponse("Service temporarily read-only", {
      status: 503,
      headers,
    });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-relayhub-pathname", request.nextUrl.pathname);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (fenceEnabled) {
    response.headers.set("x-relayhub-write-fence", "active");
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
