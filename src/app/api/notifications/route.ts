import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const unreadOnly = searchParams.get('unread') === 'true';

    const where: Record<string, unknown> = {};
    if (user.organizationId) where.organizationId = user.organizationId;
    else where.userId = user.id;
    if (unreadOnly) where.read = false;

    const notifications = await db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await db.notification.count({
      where: {
        ...(user.organizationId ? { organizationId: user.organizationId } : { userId: user.id }),
        read: false,
      },
    });

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    logger.error('Notifications GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
    const rl = checkRateLimit(request, 'api');
    if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // Mark all as read
    const body = await request.json();
    if (body.markAllRead) {
      const where: Record<string, unknown> = { read: false };
      if (user.organizationId) where.organizationId = user.organizationId;
      else where.userId = user.id;

      await db.notification.updateMany({ where, data: { read: true } });
      return NextResponse.json({ success: true });
    }

    // Mark single as read
    if (body.id) {
      // Verify the notification belongs to user's org
      const notification = await db.notification.findUnique({ where: { id: body.id } });
      if (!notification) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
      }
      if (user.role !== 'super_admin' && notification.organizationId !== user.organizationId) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
      await db.notification.update({ where: { id: body.id }, data: { read: true } });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Specify markAllRead or id' }, { status: 400 });
  } catch (error) {
    logger.error('Notifications POST error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
