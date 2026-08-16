import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyPassword, createSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { rateLimiter, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { logAudit } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    // Rate limiting: 5 login attempts per minute per IP
    const ip = getClientIp(request);
    const { allowed, remaining, resetAt } = rateLimiter.strict(ip);

    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': Math.ceil((resetAt - Date.now()) / 1000).toString(),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check user status
    if (user.status !== 'active') {
      return NextResponse.json(
        { error: 'Account is disabled. Contact administrator.' },
        { status: 403 }
      );
    }

    // Create session
    const token = await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
    });

    // Update last login
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
      // Token is ONLY delivered via HttpOnly cookie — not in response body
    });

    // Set HttpOnly, Secure, SameSite cookie
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    // Rate limit headers
    response.headers.set('X-RateLimit-Remaining', remaining.toString());

    // Audit log successful login
    await logAudit({ user: { id: user.id, email: user.email, name: user.name, role: user.role, organizationId: user.organizationId }, action: 'login', entity: 'Session', ipAddress: ip });

    return response;
  } catch (error) {
    logger.error('Login error', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
