import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { requirePermission, SETTINGS_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: SETTINGS_MANAGE
    const permErr = requirePermission(user, SETTINGS_MANAGE);
    if (permErr) return permErr;

    const settings = await db.setting.findMany({
      orderBy: { key: 'asc' },
    });

    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }

    return NextResponse.json({ settings: settingsMap });
  } catch (error) {
    logger.error('Settings GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: SETTINGS_MANAGE
    const permErr = requirePermission(user, SETTINGS_MANAGE);
    if (permErr) return permErr;

    const body = await request.json();
    const { key, value, type } = body;

    if (!key || typeof key !== 'string' || key.trim().length === 0) {
      return NextResponse.json({ error: 'Setting key is required' }, { status: 400 });
    }

    if (value === undefined || value === null) {
      return NextResponse.json({ error: 'Setting value is required' }, { status: 400 });
    }

    const setting = await db.setting.upsert({
      where: { key: key.trim() },
      update: {
        value: String(value),
        type: type || 'string',
      },
      create: {
        key: key.trim(),
        value: String(value),
        type: type || 'string',
      },
    });

    await logAudit({ user, action: 'update', entity: 'Setting', entityId: setting.id, ipAddress: getClientIp(request) });
    return NextResponse.json({ setting });
  } catch (error) {
    logger.error('Settings PUT error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
