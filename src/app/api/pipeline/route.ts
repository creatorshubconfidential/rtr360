import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

const PIPELINE_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

export async function GET(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    const where: Record<string, unknown> = {};
    if (user.role !== 'super_admin' && user.organizationId) {
      where.organizationId = user.organizationId;
    }

    // Fetch all leads grouped by status for pipeline view
    const leads = await db.lead.findMany({
      where,
      include: {
        assignedTo: { select: { id: true, name: true } },
        quotations: {
          select: { id: true, quotationNumber: true, total: true, status: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: { select: { activities: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    // Group by stage
    const pipeline: Record<string, typeof leads> = {};
    for (const stage of PIPELINE_STAGES) {
      pipeline[stage] = leads.filter((l) => l.status === stage);
    }

    // Pipeline summary stats
    const summary = {
      total: leads.length,
      byStage: PIPELINE_STAGES.reduce((acc, stage) => {
        acc[stage] = leads.filter((l) => l.status === stage).length;
        return acc;
      }, {} as Record<string, number>),
      totalValue: leads
        .filter((l) => l.status !== 'lost' && l.status !== 'closed')
        .reduce((sum, l) => {
          const vc = l.vehicleCount || 1;
          const avgDeviceCost = 50; // AED per device/month approximate
          return sum + vc * avgDeviceCost * 12;
        }, 0),
      wonThisMonth: leads.filter((l) => {
        if (l.status !== 'won') return false;
        const d = new Date(l.updatedAt);
        const now = new Date();
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      }).length,
    };

    return NextResponse.json({ pipeline, summary, stages: PIPELINE_STAGES });
  } catch (error) {
    console.error('Pipeline GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
