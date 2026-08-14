import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

// Valid lead statuses for pipeline
const VALID_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'closed'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export async function GET(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20')));
    const status = searchParams.get('status');
    const priority = searchParams.get('priority');
    const search = searchParams.get('search')?.trim();
    const source = searchParams.get('source');

    const where: Record<string, unknown> = {};

    // Tenant isolation: org users only see their org's leads
    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }

    if (status && VALID_STATUSES.includes(status)) {
      where.status = status;
    }

    if (priority && VALID_PRIORITIES.includes(priority)) {
      where.priority = priority;
    }

    if (source) {
      where.source = source;
    }

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { company: { contains: search } },
        { email: { contains: search } },
      ];
    }

    const [leads, total] = await Promise.all([
      db.lead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.lead.count({ where }),
    ]);

    return NextResponse.json({
      leads,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Leads GET error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    const body = await request.json();
    const { name, email, phone, company, emirate, vehicleCount, vehicleType, requirement, source, campaign, priority, notes } = body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Lead name is required' },
        { status: 400 }
      );
    }

    if (email && typeof email === 'string') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return NextResponse.json(
          { error: 'Invalid email format' },
          { status: 400 }
        );
      }
    }

    const leadData: Record<string, unknown> = {
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      company: company?.trim() || null,
      emirate: emirate?.trim() || null,
      vehicleCount: vehicleCount ?? null,
      vehicleType: vehicleType?.trim() || null,
      requirement: requirement?.trim() || null,
      source: source?.trim() || null,
      campaign: campaign?.trim() || null,
      priority: VALID_PRIORITIES.includes(priority) ? priority : 'medium',
      status: 'new',
      notes: notes?.trim() || null,
      assignedToId: user.id,
    };

    // If user belongs to an org, assign the lead to that org
    if (user.organizationId) {
      leadData.organizationId = user.organizationId;
    }

    const lead = await db.lead.create({ data: leadData as any });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    console.error('Leads POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
