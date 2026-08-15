import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    if (user.role !== 'super_admin' && user.role !== 'platform_admin') {
      return NextResponse.json(
        { error: 'Only super_admin or platform_admin can access settings' },
        { status: 403 }
      );
    }

    const settings = await db.setting.findMany({
      orderBy: { key: 'asc' },
    });

    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }

    return NextResponse.json({ settings: settingsMap });
  } catch (error) {
    console.error('Settings GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    if (user.role !== 'super_admin' && user.role !== 'platform_admin') {
      return NextResponse.json(
        { error: 'Only super_admin or platform_admin can update settings' },
        { status: 403 }
      );
    }

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

    return NextResponse.json({ setting });
  } catch (error) {
    console.error('Settings PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
