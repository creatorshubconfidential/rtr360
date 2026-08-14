import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

const VALID_STATUSES = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'negotiation',
  'won',
  'lost',
  'closed',
];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    const { id } = await params;

    const body = await request.json();
    const { status } = body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Find the lead
    const lead = await db.lead.findUnique({ where: { id } });

    if (!lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      );
    }

    // Ownership check: org users can only update their own org's leads
    if (user.role !== 'super_admin' && lead.organizationId !== user.organizationId) {
      return NextResponse.json(
        { error: 'You do not have permission to update this lead' },
        { status: 403 }
      );
    }

    const updated = await db.lead.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json({ lead: updated });
  } catch (error) {
    console.error('Lead PATCH error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
