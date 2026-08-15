import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProduction = process.env.NODE_ENV === 'production';

  // Block sensitive endpoints in production
  if (isProduction) {
    const blockedPaths = ['/api/setup', '/api/migrate', '/api/debug', '/setup'];
    for (const blocked of blockedPaths) {
      if (pathname.startsWith(blocked)) {
        return new NextResponse(null, { status: 404 });
      }
    }
  }

  // Security headers for all responses
  const response = NextResponse.next();

  // Content Security Policy
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none';"
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
