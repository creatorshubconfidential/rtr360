import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    const { id } = await params;
    const existing = await db.geofence.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (user.role !== 'super_admin' && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, type, centerLat, centerLng, radius, polygonPoints } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (type !== undefined) updateData.type = type;
    if (centerLat !== undefined) updateData.centerLat = centerLat;
    if (centerLng !== undefined) updateData.centerLng = centerLng;
    if (radius !== undefined) updateData.radius = radius;
    if (polygonPoints !== undefined) updateData.polygonPoints = JSON.stringify(polygonPoints);

    const geofence = await db.geofence.update({
      where: { id },
      data: updateData,
      include: { organization: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ geofence });
  } catch (error) {
    console.error('Geofences PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    const { id } = await params;
    const existing = await db.geofence.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (user.role !== 'super_admin' && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.geofence.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Geofences DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
