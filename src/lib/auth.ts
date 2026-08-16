import { db } from '@/lib/db';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string | null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string | null;
}): Promise<string> {
  // Generate a random token (48 bytes hex)
  const token = randomBytes(48).toString('hex');

  // Session expires in 7 days
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.session.create({
    data: {
      token,
      userId: user.id,
      expiresAt,
    },
  });

  return token;
}

export async function verifySession(token: string): Promise<UserSession | null> {
  const session = await db.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) return null;

  // Check if session has expired
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } });
    return null;
  }

  // Check if user is active
  if (session.user.status !== 'active') return null;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    organizationId: session.user.organizationId,
  };
}

export async function deleteSession(token: string): Promise<boolean> {
  try {
    await db.session.delete({ where: { token } });
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates password strength.
 * Requirements: 10+ chars, uppercase, lowercase, digit.
 * Returns null if valid, or an error message string.
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 10) {
    return 'Password must be at least 10 characters long';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one digit';
  }
  return null;
}

export const SESSION_COOKIE_NAME = 'rtr_session';

/**
 * Extract session token from HttpOnly cookie (primary) or Authorization header (fallback for non-browser clients).
 */
export function extractToken(authHeader: string | null, cookieHeader: string | null): string | null {
  // 1. HttpOnly cookie (primary — used by browser clients)
  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`));
    if (match) return decodeURIComponent(match[1]);
  }
  // 2. Authorization header fallback (for non-browser API consumers)
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') return parts[1];
  }
  return null;
}

/**
 * Helper to get authenticated user from request
 * Returns the session user or null, and also sets appropriate response status
 */
export async function getAuthUser(
  request: Request
): Promise<{ user: UserSession | null; error: Response | null }> {
  const token = extractToken(
    request.headers.get('Authorization'),
    request.headers.get('Cookie')
  );

  if (!token) {
    return {
      user: null,
      error: new Response(JSON.stringify({ error: 'Missing authorization token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  const user = await verifySession(token);

  if (!user) {
    return {
      user: null,
      error: new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  return { user, error: null };
}

/**
 * Type-safe auth helper. Returns an authenticated UserSession (never null).
 * If auth fails, returns an error Response that the caller must return immediately.
 *
 * Usage:
 *   const auth = requireAuth(request);
 *   if (auth.error) return auth.error;
 *   // auth.user is now UserSession (not null)
 *   console.log(auth.user.role);
 */
export async function requireAuth(
  request: Request
): Promise<{ user: UserSession; error: Response | null }> {
  const result = await getAuthUser(request);
  if (result.error) return { user: result.user as UserSession, error: result.error };
  return { user: result.user!, error: null };
}
