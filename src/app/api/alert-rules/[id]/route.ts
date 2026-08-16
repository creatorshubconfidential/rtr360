import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

import { requirePermission, ALERT_RULES_MANAGE } from '@/lib/permissions';
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    // RBAC: ALERT_RULES_MANAGE
    const permErr = requirePermission(user, ALERT_RULES_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const existing = await db.alertRule.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (user.role !== 'super_admin' && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, type, conditions, channels, active } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (type !== undefined) updateData.type = type;
    if (conditions !== undefined) updateData.conditions = JSON.stringify(conditions);
    if (channels !== undefined) updateData.channels = JSON.stringify(channels);
    if (active !== undefined) updateData.active = Boolean(active);

    const alertRule = await db.alertRule.update({
      where: { id },
      data: updateData,
      include: { organization: { select: { id: true, name: true } } },
    });

    const parsed = {
      ...alertRule,
      conditions: alertRule.conditions ? JSON.parse(alertRule.conditions) : null,
      channels: alertRule.channels ? JSON.parse(alertRule.channels) : ['in_app'],
    };

    return NextResponse.json({ alertRule: parsed });
  } catch (error) {
    console.error('AlertRules PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    // RBAC: ALERT_RULES_MANAGE
    const permErr = requirePermission(user, ALERT_RULES_MANAGE);
    if (permErr) return permErr;

    const { id } = await params;
    const existing = await db.alertRule.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (user.role !== 'super_admin' && existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await db.alertRule.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('AlertRules DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
