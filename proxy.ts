import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/proxy";

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/demo") {
    if (request.method === "GET" || request.method === "HEAD") {
      return NextResponse.next();
    }
    return new NextResponse(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
