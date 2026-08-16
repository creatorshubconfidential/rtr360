import { Request } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hashPassword, validatePasswordStrength } from '@/lib/auth';
import { requirePermission, ADMIN_MANAGE } from '@/lib/permissions';

// GET /api/admin/organizations — List all orgs with usage stats
export async function GET(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    // RBAC: ADMIN_MANAGE
    const permErr = requirePermission(user, ADMIN_MANAGE);
    if (permErr) return permErr;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all';
    const emirate = searchParams.get('emirate') || '';
    const plan = searchParams.get('plan') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { tradeName: { contains: search } },
        { email: { contains: search } },
      ];
    }
    if (status !== 'all') where.status = status;
    if (emirate) where.emirate = emirate;
    if (plan) where.planName = plan;

    const [organizations, total] = await Promise.all([
      db.organization.findMany({
        where,
        select: {
          id: true,
          name: true,
          tradeName: true,
          legalName: true,
          email: true,
          phone: true,
          website: true,
          emirate: true,
          city: true,
          status: true,
          currency: true,
          planName: true,
          vehicleLimit: true,
          userLimit: true,
          whiteLabelEnabled: true,
          brandedAppName: true,
          primaryColor: true,
          customDomain: true,
          domainVerified: true,
          createdAt: true,
          _count: {
            select: {
              users: { where: { status: 'active' } },
              vehicles: true,
              devices: true,
              drivers: true,
              branches: true,
              invoices: true,
              tickets: true,
              leads: true,
              subscriptions: true,
              technicians: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.organization.count({ where }),
    ]);

    // Get status distribution
    const statusCounts = await db.organization.groupBy({
      by: ['status'],
      _count: true,
    });

    // Get plan distribution
    const planCounts = await db.organization.groupBy({
      by: ['planName'],
      _count: true,
      where: { planName: { not: null } },
    });

    return Response.json({
      organizations,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      counts: {
        status: Object.fromEntries(statusCounts.map((s: any) => [s.status, s._count])),
        plans: Object.fromEntries(planCounts.map((p: any) => [p.planName, p._count])),
      },
    });
  } catch (error: any) {
    console.error('Organizations list error:', error);
    return Response.json({ error: 'Failed to fetch organizations' }, { status: 500 });
  }
}

// POST /api/admin/organizations — Create new org + admin user (onboarding)
export async function POST(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    // RBAC: ADMIN_MANAGE
    const permErr = requirePermission(user, ADMIN_MANAGE);
    if (permErr) return permErr;

    const body = await request.json();
    const {
      name,
      tradeName,
      legalName,
      email,
      phone,
      emirate,
      city,
      address,
      industry,
      website,
      planName,
      vehicleLimit,
      userLimit,
      // Admin user fields
      adminName,
      adminEmail,
      adminPassword,
      // White-label branding (optional)
      primaryColor,
      accentColor,
      brandedAppName,
      whiteLabelEnabled,
    } = body;

    // Validation
    if (!name?.trim()) return Response.json({ error: 'Organization name is required' }, { status: 400 });
    if (!adminName?.trim()) return Response.json({ error: 'Admin name is required' }, { status: 400 });
    if (!adminEmail?.trim()) return Response.json({ error: 'Admin email is required' }, { status: 400 });
    if (!adminPassword) return Response.json({ error: 'Admin password is required' }, { status: 400 });
    const pwError = validatePasswordStrength(adminPassword);
    if (pwError) return Response.json({ error: pwError }, { status: 400 });

    // Check if org email exists
    if (email) {
      const existingOrg = await db.organization.findFirst({ where: { email } });
      if (existingOrg) return Response.json({ error: 'Organization email already exists' }, { status: 409 });
    }

    // Check if admin email exists
    const existingUser = await db.user.findUnique({ where: { email: adminEmail } });
    if (existingUser) return Response.json({ error: 'Admin email already exists' }, { status: 409 });

    // Create org + admin user in transaction
    const org = await db.$transaction(async (tx) => {
      const newOrg = await tx.organization.create({
        data: {
          name: name.trim(),
          tradeName: tradeName?.trim() || null,
          legalName: legalName?.trim() || null,
          email: email?.trim() || null,
          phone: phone?.trim() || null,
          emirate: emirate || null,
          city: city?.trim() || null,
          address: address?.trim() || null,
          industry: industry?.trim() || null,
          website: website?.trim() || null,
          planName: planName || 'Starter',
          vehicleLimit: vehicleLimit || 10,
          userLimit: userLimit || 5,
          whiteLabelEnabled: whiteLabelEnabled || false,
          brandedAppName: brandedAppName?.trim() || null,
          primaryColor: primaryColor?.trim() || null,
          accentColor: accentColor?.trim() || null,
          status: 'active',
        },
      });

      // Hash password and create admin user
      const passwordHash = await hashPassword(adminPassword);
      const adminUser = await tx.user.create({
        data: {
          email: adminEmail.trim(),
          name: adminName.trim(),
          passwordHash,
          role: 'org_owner',
          organizationId: newOrg.id,
          status: 'active',
          emailVerified: true,
        },
      });

      // Create a default branch
      await tx.branch.create({
        data: {
          name: `${newOrg.name} — Main Branch`,
          address: address?.trim() || null,
          emirate: emirate || null,
          organizationId: newOrg.id,
        },
      });

      return newOrg;
    });

    return Response.json({
      success: true,
      data: org,
      message: `Organization "${org.name}" created with admin user ${adminEmail}`,
    }, { status: 201 });
  } catch (error: any) {
    console.error('Organization create error:', error);
    return Response.json({ error: 'Failed to create organization' }, { status: 500 });
  }
}
