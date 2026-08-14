import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, verifyPassword, createSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Ensure super admin exists
    const existingAdmin = await db.user.findUnique({
      where: { email: 'admin@rtr.ae' },
    });

    if (!existingAdmin) {
      const hashedPw = await hashPassword('REDACTED_DEMO_PASSWORD');
      await db.user.create({
        data: {
          email: 'admin@rtr.ae',
          passwordHash: hashedPw,
          name: 'RTR Admin',
          role: 'super_admin',
          organizationId: null,
          status: 'active',
          emailVerified: true,
        },
      });
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

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
      },
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
