import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { logger } from '@/lib/logger';

/**
 * POST /api/setup/seed
 *
 * Creates the default organization and admin user if the database is empty.
 * Call this ONCE after first deployment to initialize the database.
 *
 * Security: In production, this endpoint should be blocked after initial setup.
 * The proxy.ts / middleware blocks /api/setup/* on production.
 */
export async function POST(request: Request) {
  try {
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
    let adminPassword = 'admin123';
    let adminName = 'Admin';

    try {
      const body = await request.json();
      if (body.email) adminEmail = body.email;
      if (body.password) adminPassword = body.password;
      if (body.name) adminName = body.name;
    } catch {
      // No body — use defaults
    }

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

    return NextResponse.json({
      message: 'Database seeded successfully',
      seeded: true,
      organization: { id: org.id, name: org.name },
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
      plan: { id: plan.id, name: plan.name },
    });
  } catch (error) {
    logger.error('Seed error', { error });
    return NextResponse.json(
      { error: 'Seed failed', details: String(error) },
      { status: 500 }
    );
  }
}

// Also allow GET for easy browser-based setup
export async function GET() {
  return POST(new Request('http://localhost', { method: 'POST' }));
}
