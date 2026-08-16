import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, TECHNICIANS_MANAGE } from '@/lib/permissions';
const VALID_STATUSES = ['active', 'inactive', 'on_leave'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: TECHNICIANS_MANAGE
    const permErr = requirePermission(user, TECHNICIANS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const body = await request.json();
    const { status, name, phone, email, emirate, specialty, notes } = body;

    const existing = await db.technician.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Technician not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.organizationId && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    if (status && VALID_STATUSES.includes(status)) updateData.status = status;
    if (name) updateData.name = name.trim();
    if (phone) updateData.phone = phone.trim();
    if (email !== undefined) updateData.email = email?.trim() || null;
    if (emirate !== undefined) updateData.emirate = emirate || null;
    if (specialty !== undefined) updateData.specialty = specialty?.trim() || null;
    if (notes !== undefined) updateData.notes = notes?.trim() || null;

    const technician = await db.technician.update({ where: { id }, data: updateData });
    return NextResponse.json({ technician });
  } catch (error) {
    console.error('Technician PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: TECHNICIANS_MANAGE
    const permErr = requirePermission(user, TECHNICIANS_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const existing = await db.technician.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Technician not found' }, { status: 404 });
    }

    if (user.role !== 'super_admin' && user.organizationId && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.installation.updateMany({ where: { technicianId: id }, data: { technicianId: null } });
    await db.technician.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Technician DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
