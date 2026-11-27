import { NextResponse, type NextRequest } from "next/server";

// Per-request nonce for a strict Content-Security-Policy.
// Next.js reads the nonce out of this header and applies it to framework scripts;
// next-themes and the demo-flag inline script read it via headers() in the layout.
export function middleware(request: NextRequest) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // React/Next inline styles need unsafe-inline; style nonces aren't viable here.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Skip static assets; they don't render HTML and don't need a per-request nonce.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)"],
};
