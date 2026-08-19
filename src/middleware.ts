import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getRequestId, REQUEST_ID_HEADER } from '@/lib/request-id';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProduction = process.env.NODE_ENV === 'production';

  // Block sensitive endpoints in production
  if (isProduction) {
    const blockedPaths = ['/api/setup/seed', '/api/setup/seed-demo', '/api/migrate', '/api/debug'];
    for (const blocked of blockedPaths) {
      if (pathname === blocked || pathname.startsWith(blocked + '/')) {
        return new NextResponse(null, { status: 404 });
      }
    }
  }

  // Generate or validate incoming request ID
  const requestId = getRequestId(request);

  // Security headers for all responses
  const response = NextResponse.next();

  // Attach request ID to response
  response.headers.set(REQUEST_ID_HEADER, requestId);

  // Content Security Policy
  // 'unsafe-inline' in style-src is required for Tailwind CSS runtime classes.
  // 'wasm-unsafe-eval' is required by Next.js server component runtime.
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.tile.openstreetmap.org; font-src 'self' data:; connect-src 'self' https://*.tile.openstreetmap.org; frame-ancestors 'none';"
  );

  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');

  // Prevent MIME sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // HSTS — 1 year, include subdomains
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions policy — restrict browser features
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=()'
  );

  // X-XSS Protection (legacy browsers)
  response.headers.set('X-XSS-Protection', '1; mode=block');

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt
     * - public folder assets (icons, manifest, sw.js, logo)
     */
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|icons|manifest.json|sw.js|logo.svg).*)',
  ],
};
