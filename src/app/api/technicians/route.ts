import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

const VALID_STATUSES = ['active', 'inactive', 'on_leave'];

export async function GET(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const status = searchParams.get('status');
    const emirate = searchParams.get('emirate');
    const search = searchParams.get('search')?.trim();

    const where: Record<string, unknown> = {};

    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }

    if (status && VALID_STATUSES.includes(status)) {
      where.status = status;
    }

    if (emirate) {
      where.emirate = emirate;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const [technicians, total] = await Promise.all([
      db.technician.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { installations: true } },
          installations: {
            where: { status: 'completed' },
            take: 0,
          },
        },
      }),
      db.technician.count({ where }),
    ]);

    return NextResponse.json({
      technicians,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error('Technicians GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    if (!user.organizationId && user.role !== 'super_admin') {
      return NextResponse.json({ error: 'You must belong to an organization' }, { status: 403 });
    }

    const body = await request.json();
    const { name, phone, email, emirate, specialty, notes } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Technician name is required' }, { status: 400 });
    }

    if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 });
    }

    const techData: Record<string, unknown> = {
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim() || null,
      emirate: emirate || null,
      specialty: specialty?.trim() || null,
      notes: notes?.trim() || null,
      status: 'active',
    };

    if (user.organizationId) {
      techData.organizationId = user.organizationId;
    }

    const technician = await db.technician.create({ data: techData as any });
    return NextResponse.json({ technician }, { status: 201 });
  } catch (error) {
    console.error('Technicians POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
