import { NextResponse } from 'next/server';
import { deleteSession, SESSION_COOKIE_NAME } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    // Try to read token from body (for backward compat) or from cookie
    let token: string | null = null;
    try {
      const body = await request.json();
      if (body.token) token = body.token;
    } catch {
      // No body — that's fine, we'll try cookie
    }

    // Fallback to cookie
    if (!token) {
      const cookieHeader = request.headers.get('Cookie');
      if (cookieHeader) {
        const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`));
        if (match) token = decodeURIComponent(match[1]);
      }
    }

    if (token) {
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
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
