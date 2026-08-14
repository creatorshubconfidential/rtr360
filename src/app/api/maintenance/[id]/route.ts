import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

const VALID_STATUSES = ['upcoming', 'scheduled', 'in_progress', 'completed', 'cancelled'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const {
      status,
      description,
      cost,
      completedDate,
      scheduledDate,
      triggerType,
      triggerValue,
      type,
    } = body;

    const existing = await db.maintenanceRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Maintenance record not found' }, { status: 404 });
    }

    // Verify ownership (tenant isolation)
    if (user.role !== 'super_admin' && user.organizationId && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json(
          { error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` },
          { status: 400 }
        );
      }
      updateData.status = status;
    }
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (cost !== undefined) updateData.cost = cost ?? null;
    if (completedDate !== undefined) updateData.completedDate = completedDate ? new Date(completedDate) : null;
    if (scheduledDate !== undefined) updateData.scheduledDate = scheduledDate ? new Date(scheduledDate) : null;
    if (triggerType !== undefined) updateData.triggerType = triggerType?.trim() || null;
    if (triggerValue !== undefined) updateData.triggerValue = triggerValue ?? null;
    if (type !== undefined) updateData.type = type?.trim() || null;

    const maintenanceRecord = await db.maintenanceRecord.update({
      where: { id },
      data: updateData,
      include: {
        vehicle: {
          select: { id: true, plateNumber: true, make: true, model: true },
        },
        organization: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ maintenanceRecord });
  } catch (error) {
    console.error('Maintenance PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    const { id } = await params;

    const existing = await db.maintenanceRecord.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Maintenance record not found' }, { status: 404 });
    }

    // Verify ownership (tenant isolation)
    if (user.role !== 'super_admin' && user.organizationId && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.maintenanceRecord.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Maintenance DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
