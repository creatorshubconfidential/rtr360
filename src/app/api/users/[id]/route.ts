import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, hashPassword } from '@/lib/auth';

const VALID_ROLES = ['super_admin', 'platform_admin', 'operations_manager', 'sales_manager', 'fleet_manager', 'dispatcher', 'viewer', 'org_owner'];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

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
    if (role !== undefined && VALID_ROLES.includes(role)) updateData.role = role;
    if (password) updateData.passwordHash = await hashPassword(password);

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
