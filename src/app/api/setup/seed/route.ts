import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

/**
 * POST /api/setup/seed
 *
 * Creates the default organization and admin user if the database is empty.
 * Call this ONCE after first deployment to initialize the database.
 *
 * Security (defense-in-depth):
 *   1. Middleware blocks this path in production (returns 404).
 *   2. This handler also checks NODE_ENV and rejects production requests.
 *   3. Require auth + admin role check (for environments where middleware may be bypassed).
 */
export async function POST(request: Request) {
  try {
    // ── Defense-in-depth: reject in production even if middleware is misconfigured ──
    if (process.env.NODE_ENV === 'production') {
      logger.warn('seed blocked: production environment');
      return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
    }

    // ── Auth check — only admins can seed the database ──
    const { user, error: authError } = await requireAuth(request);
    if (authError) return authError as NextResponse;
    if (!['super_admin', 'org_owner', 'platform_admin', 'admin'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Only administrators can seed the database' },
        { status: 403 }
      );
    }

    // Check if any users already exist
    const userCount = await db.user.count();
    if (userCount > 0) {
      return NextResponse.json({
        message: `Database already has ${userCount} user(s). Seed skipped.`,
        seeded: false,
      });
    }

    // Parse optional body for custom admin credentials
    let adminEmail = 'admin@rtr.ae';
    let adminName = 'Admin';
    let adminPassword = '';
    let hasCustomPassword = false;

    try {
      const body = await request.json();
      if (body.email) adminEmail = body.email;
      if (body.password) { adminPassword = body.password; hasCustomPassword = true; }
      if (body.name) adminName = body.name;
    } catch {
      // No body — use defaults
    }

    // Use env var, body-provided password, or generate a random one
    if (!adminPassword) {
      adminPassword = process.env.SEED_PASSWORD || Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    const isGenerated = !hasCustomPassword && !process.env.SEED_PASSWORD;

    logger.info('Seeding database with default organization and admin user...');

    // 1. Create default organization
    const org = await db.organization.create({
      data: {
        name: 'RTR 360',
        tradeName: 'RTR 360 Fleet Technology',
        email: 'info@rtr.ae',
        phone: '+971501234567',
        emirate: 'Dubai',
        country: 'AE',
        currency: 'AED',
        status: 'active',
      },
    });

    // 2. Create default plan (Free)
    const plan = await db.plan.create({
      data: {
        name: 'Free',
        description: 'Free tier for small fleets',
        priceMonthly: 0,
        vehicleLimit: 5,
        active: true,
      },
    });

    // 3. Create admin user
    const passwordHash = await hashPassword(adminPassword);
    const admin = await db.user.create({
      data: {
        email: adminEmail.toLowerCase().trim(),
        passwordHash,
        name: adminName,
        role: 'admin',
        organizationId: org.id,
        status: 'active',
        emailVerified: true,
      },
    });

    // 4. Create subscription for the org
    await db.subscription.create({
      data: {
        organizationId: org.id,
        planId: plan.id,
        status: 'active',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      },
    });

    logger.info('Database seeded successfully', { orgId: org.id, adminId: admin.id });

    const response: Record<string, unknown> = {
      message: 'Database seeded successfully',
      seeded: true,
      organization: { id: org.id, name: org.name },
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
      plan: { id: plan.id, name: plan.name },
    };
    if (isGenerated) {
      response.generatedPassword = adminPassword;
      logger.warn('Generated random admin password — save it now!', { password: adminPassword });
    }

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Seed error', { error });
    return NextResponse.json(
      { error: 'Seed failed', details: String(error) },
      { status: 500 }
    );
  }
}

// GET is not supported — use POST with auth credentials
export async function GET() {
  return NextResponse.json({ error: 'Use POST with authentication' }, { status: 405 });
}
