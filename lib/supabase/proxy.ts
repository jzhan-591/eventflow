import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const cacheHeaders = new Headers();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          // Forward refreshed cookies to the current request and to the browser.
          const nextResponse = NextResponse.next({ request });
          for (const cookie of response.cookies.getAll()) {
            nextResponse.cookies.set(cookie);
          }
          for (const { name, value, options } of cookiesToSet) {
            nextResponse.cookies.set(name, value, options);
          }
          for (const [name, value] of Object.entries(headers)) {
            cacheHeaders.set(name, value);
          }
          cacheHeaders.forEach((value, name) => nextResponse.headers.set(name, value));
          response = nextResponse;
        },
      },
    },
  );

  const { data, error } = await supabase.auth.getClaims();

  if (request.nextUrl.pathname === "/" && (error || !data?.claims.sub)) {
    const loginResponse = NextResponse.redirect(new URL("/login", request.url));
    for (const cookie of response.cookies.getAll()) {
      loginResponse.cookies.set(cookie);
    }
    cacheHeaders.forEach((value, name) => loginResponse.headers.set(name, value));
    loginResponse.headers.set("Cache-Control", "private, no-store");
    return loginResponse;
  }

  return response;
}
