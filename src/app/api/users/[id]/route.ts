import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hashPassword, validatePasswordStrength } from '@/lib/auth';

import { requirePermission, USERS_MANAGE } from '@/lib/permissions';
const VALID_ROLES = ['super_admin', 'platform_admin', 'operations_manager', 'sales_manager', 'fleet_manager', 'dispatcher', 'viewer', 'org_owner'] as const;

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

const NON_PLATFORM_ROLES = ['viewer', 'dispatcher', 'fleet_manager', 'sales_manager', 'operations_manager', 'org_owner'] as const;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    // RBAC: USERS_MANAGE
    const permErr = requirePermission(user, USERS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Non-super_admin can only edit users in their org
    if (user.role !== 'super_admin' && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Only super_admin can edit other super_admins
    if (existing.role === 'super_admin' && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, password, phone, role, status } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone;
    if (status !== undefined) updateData.status = status;

    // SECURITY: Role change must follow hierarchy rules
    if (role !== undefined) {
      if (!VALID_ROLES.includes(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }
      if (user.role === 'super_admin') {
        // Super admin can set any role
        updateData.role = role;
      } else if (user.role === 'platform_admin') {
        if (role === 'super_admin') {
          return NextResponse.json({ error: 'Cannot assign super_admin role' }, { status: 403 });
        }
        if (!NON_PLATFORM_ROLES.includes(role as typeof NON_PLATFORM_ROLES[number])) {
          return NextResponse.json({ error: 'Cannot assign platform roles' }, { status: 403 });
        }
        updateData.role = role;
      } else {
        // Org-scoped users: cannot assign platform roles, cannot escalate above own level
        if (!NON_PLATFORM_ROLES.includes(role as typeof NON_PLATFORM_ROLES[number])) {
          return NextResponse.json({ error: 'Cannot assign platform roles' }, { status: 403 });
        }
        const callerLevel = ROLE_HIERARCHY[user.role] ?? 0;
        const targetLevel = ROLE_HIERARCHY[role] ?? 0;
        if (targetLevel > callerLevel) {
          return NextResponse.json({ error: 'Cannot assign role higher than your own' }, { status: 403 });
        }
        updateData.role = role;
      }
    }
    if (password) {
      const pwError = validatePasswordStrength(password);
      if (pwError) {
        return NextResponse.json({ error: pwError }, { status: 400 });
      }
      updateData.passwordHash = await hashPassword(password);
    }

    const updatedUser = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true, email: true, name: true, phone: true,
        role: true, status: true, emailVerified: true,
        organizationId: true, lastLoginAt: true, createdAt: true,
        organization: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error('Users PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    // RBAC: USERS_MANAGE
    const permErr = requirePermission(user, USERS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    if (id === user.id) {
      return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (user.role !== 'super_admin' && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (existing.role === 'super_admin') {
      return NextResponse.json({ error: 'Cannot delete super admin' }, { status: 403 });
    }

    // Delete user's sessions
    await db.session.deleteMany({ where: { userId: id } });
    await db.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Users DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
