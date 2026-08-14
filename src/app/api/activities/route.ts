import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

const VALID_TYPES = ['call', 'email', 'meeting', 'note', 'task', 'whatsapp', 'visit'];

export async function GET(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const leadId = searchParams.get('leadId');
    const opportunityId = searchParams.get('opportunityId');
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')));

    const where: Record<string, unknown> = {};
    if (leadId) where.leadId = leadId;
    if (opportunityId) where.opportunityId = opportunityId;

    const activities = await db.activity.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return NextResponse.json({ activities });
  } catch (error) {
    console.error('Activities GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    const body = await request.json();
    const { type, title, description, leadId, opportunityId, dueDate, completed } = body;

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const activity = await db.activity.create({
      data: {
        type,
        title: title.trim(),
        description: description?.trim() || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        completed: completed === true,
        userId: user.id,
        leadId: leadId || null,
        opportunityId: opportunityId || null,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ activity }, { status: 201 });
  } catch (error) {
    console.error('Activities POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
