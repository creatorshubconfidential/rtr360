import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, ALERT_RULES_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
const VALID_TYPES = ['overspeed', 'geofence_enter', 'geofence_exit', 'sos', 'idle', 'fuel_drop', 'tamper', 'power_off', 'low_battery', 'harsh_braking', 'harsh_acceleration'];
const VALID_CHANNELS = ['in_app', 'email', 'sms', 'whatsapp'];

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const type = searchParams.get('type');
    const active = searchParams.get('active');

    const where: Record<string, unknown> = {};
    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }
    if (type) where.type = type;
    if (active !== null && active !== undefined) where.active = active === 'true';

    const [rules, total] = await Promise.all([
      db.alertRule.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { organization: { select: { id: true, name: true } } },
      }),
      db.alertRule.count({ where }),
    ]);

    // Parse JSON string fields for client
    const parsedRules = rules.map(r => ({
      ...r,
      conditions: r.conditions ? JSON.parse(r.conditions) : null,
      channels: r.channels ? JSON.parse(r.channels) : ['in_app'],
    }));

    return NextResponse.json({
      alertRules: parsedRules,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logger.error('AlertRules GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: ALERT_RULES_MANAGE
    const permErr = requirePermission(user, ALERT_RULES_MANAGE);
    if (permErr) return permErr;

    if (!user.organizationId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'Organization required' }, { status: 403 });
    }

    const body = await request.json();
    const { name, type, conditions, channels, active } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Valid: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    const parsedConditions = conditions ? JSON.stringify(conditions) : null;
    const parsedChannels = channels ? JSON.stringify(channels) : 'in_app';

    const alertRule = await db.alertRule.create({
      data: {
        name: name.trim(),
        type,
        conditions: parsedConditions,
        channels: parsedChannels,
        active: active !== false,
        organizationId: user.organizationId!,
      },
      include: { organization: { select: { id: true, name: true } } },
    });
        await logAudit({ user, action: 'create', entity: 'AlertRule', entityId: alertRule?.id, ipAddress: getClientIp(request) });

    const parsed = {
      ...alertRule,
      conditions: alertRule.conditions ? JSON.parse(alertRule.conditions) : null,
      channels: alertRule.channels ? JSON.parse(alertRule.channels) : ['in_app'],
    };

    return NextResponse.json({ alertRule: parsed }, { status: 201 });
  } catch (error) {
    logger.error('AlertRules POST error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
