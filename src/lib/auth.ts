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
 * Helper to extract Bearer token from Authorization header
 */
export function extractToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}

/**
 * Helper to get authenticated user from request
 * Returns the session user or null, and also sets appropriate response status
 */
export async function getAuthUser(
  request: Request
): Promise<{ user: UserSession | null; error: Response | null }> {
  const token = extractToken(request.headers.get('Authorization'));

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
