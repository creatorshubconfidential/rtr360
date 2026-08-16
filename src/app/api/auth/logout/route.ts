import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { deleteSession, extractToken, SESSION_COOKIE_NAME } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
import { verifySession } from '@/lib/auth';

export async function POST(request: Request) {
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    // Read token from HttpOnly cookie (sent automatically by browser)
    const token = extractToken(null, request.headers.get('Cookie'));

    if (token) {
      // Audit log before session deletion
      const session = await verifySession(token);
      if (session) {
        await logAudit({ user: session, action: 'logout', entity: 'Session', ipAddress: getClientIp(request) });
      }
      await deleteSession(token);
    }

    const response = NextResponse.json({ success: true });

    // Clear the cookie
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    logger.error('Logout error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
