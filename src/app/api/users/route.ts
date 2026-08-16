import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth, hashPassword, validatePasswordStrength } from '@/lib/auth';

import { requirePermission, USERS_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
const VALID_ROLES = ['super_admin', 'platform_admin', 'operations_manager', 'sales_manager', 'fleet_manager', 'dispatcher', 'viewer', 'org_owner'] as const;

// Role hierarchy: higher index = more powerful. A user can only assign roles <= their own level.
const ROLE_HIERARCHY: Record<string, number> = {
  viewer: 0,
  dispatcher: 1,
  fleet_manager: 2,
  sales_manager: 2,
  operations_manager: 3,
  org_owner: 4,
  platform_admin: 5,
  super_admin: 6,
};

// Roles that non-super_admin users are allowed to assign (bounded by their own level)
const NON_PLATFORM_ROLES = ['viewer', 'dispatcher', 'fleet_manager', 'sales_manager', 'operations_manager', 'org_owner'] as const;

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim();
    const role = searchParams.get('role');
    const status = searchParams.get('status');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    const where: Record<string, unknown> = {};
    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }
    if (role) where.role = role;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, email: true, name: true, phone: true, avatar: true,
          role: true, status: true, emailVerified: true,
          organizationId: true, lastLoginAt: true, createdAt: true,
          organization: { select: { id: true, name: true } },
        },
      }),
      db.user.count({ where }),
    ]);

    return NextResponse.json({
      users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('Users GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: USERS_MANAGE
    const permErr = requirePermission(user, USERS_MANAGE);
    if (permErr) return permErr;

    const body = await request.json();
    const { name, email, password, phone, role, organizationId, status } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Name, email, and password are required' }, { status: 400 });
    }

    // Password strength validation
    const pwError = validatePasswordStrength(password);
    if (pwError) {
      return NextResponse.json({ error: pwError }, { status: 400 });
    }

    // SECURITY: Determine the role to assign — NEVER trust client-supplied role blindly
    let assignedRole = 'viewer'; // default
    if (user.role === 'super_admin') {
      // Super admin can assign any role
      if (role && VALID_ROLES.includes(role)) {
        assignedRole = role;
      }
    } else if (user.role === 'platform_admin') {
      // Platform admin can assign non-super_admin roles
      if (role && NON_PLATFORM_ROLES.includes(role as typeof NON_PLATFORM_ROLES[number])) {
        assignedRole = role;
      } else if (role && role === 'super_admin') {
        return NextResponse.json({ error: 'Cannot assign super_admin role' }, { status: 403 });
      }
    } else {
      // Org-scoped users (org_owner, etc.) can only assign roles <= their own level
      const callerLevel = ROLE_HIERARCHY[user.role] ?? 0;
      if (role) {
        if (!NON_PLATFORM_ROLES.includes(role as typeof NON_PLATFORM_ROLES[number])) {
          return NextResponse.json({ error: 'Cannot assign platform roles' }, { status: 403 });
        }
        const targetLevel = ROLE_HIERARCHY[role] ?? 0;
        if (targetLevel > callerLevel) {
          return NextResponse.json({ error: 'Cannot assign role higher than your own' }, { status: 403 });
        }
        assignedRole = role;
      }
    }

    // SECURITY: NEVER trust client-supplied organizationId
    // Non-super_admin users can only create users in their own organization
    let targetOrgId: string | null = null;
    if (user.role === 'super_admin') {
      // Super admin may specify org (for creating users in other orgs)
      if (organizationId) {
        const orgExists = await db.organization.findUnique({ where: { id: organizationId } });
        if (!orgExists) {
          return NextResponse.json({ error: 'Organization not found' }, { status: 400 });
        }
        targetOrgId = organizationId;
      } else {
        targetOrgId = user.organizationId || null;
      }
    } else {
      // All other users: always use their own org
      targetOrgId = user.organizationId || null;
    }

    // Check email uniqueness
    const existing = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const newUser = await db.user.create({
      data: {
        name: name.trim(),
        email: email.toLowerCase().trim(),
        passwordHash,
        phone: phone || null,
        role: assignedRole,
        organizationId: targetOrgId,
        status: status || 'active',
        emailVerified: false,
      },
      select: {
        id: true, email: true, name: true, phone: true,
        role: true, status: true, organizationId: true, createdAt: true,
        organization: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (error) {
    logger.error('Users POST error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
