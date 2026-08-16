import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const orgFilter = user.role === 'super_admin' ? {} : { organizationId: user.organizationId! };
    const orgFilterStrict = user.role === 'super_admin' ? {} : { organizationId: user.organizationId! };

    const now = new Date();

    // 1. Historical revenue (last 12 months)
    const historicalRevenue: { month: string; revenue: number; invoices: number; newClients: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthName = mStart.toLocaleString('en', { month: 'short', year: '2-digit' });

      const [invoices, orgs] = await Promise.all([
        db.invoice.findMany({
          where: { ...orgFilterStrict, status: 'paid', createdAt: { gte: mStart, lt: mEnd } },
          select: { total: true },
        }),
        // SECURITY: For non-super_admin, newClients is always 0 or 1 (their own org)
        user.role === 'super_admin'
          ? db.organization.count({ where: { createdAt: { gte: mStart, lt: mEnd } } })
          : Promise.resolve(0),
      ]);

      historicalRevenue.push({
        month: monthName,
        revenue: invoices.reduce((s, inv) => s + Number(inv.total), 0),
        invoices: invoices.length,
        newClients: orgs,
      });
    }

    // 2. Subscription-based recurring revenue
    const subscriptions = await db.subscription.findMany({
      where: { ...orgFilter, status: 'active' },
      include: {
        plan: true,
        organization: { select: { name: true } },
      },
    });

    const monthlyRecurring = subscriptions.reduce((s, sub) => s + Number(sub.plan.priceMonthly), 0);
    const annualRecurring = monthlyRecurring * 12;

    // 3. Pipeline value (potential future revenue)
    const pipelineValue = await db.lead.aggregate({
      where: { ...orgFilter, status: { in: ['qualified', 'proposal', 'negotiation'] } },
      _sum: { vehicleCount: true },
    });
    const estPipelineVehicles = pipelineValue._sum.vehicleCount || 0;
    const avgMonthlyPerVehicle = subscriptions.length > 0
      ? monthlyRecurring / subscriptions.reduce((s, sub) => s + sub.vehicleCount, 0)
      : 35; // default AED 35/device/month
    const pipelineMonthlyPotential = Math.round(estPipelineVehicles * avgMonthlyPerVehicle);

    // 4. Simple linear regression for forecast (last 6 months)
    const last6 = historicalRevenue.slice(-6);
    const n = last6.length;
    const xMean = (n - 1) / 2;
    const yMean = last6.reduce((s, m) => s + m.revenue, 0) / n;
    let num = 0, den = 0;
    last6.forEach((m, i) => {
      num += (i - xMean) * (m.revenue - yMean);
      den += (i - xMean) ** 2;
    });
    const slope = den !== 0 ? num / den : 0;
    const intercept = yMean - slope * xMean;

    // Generate 6-month forecast
    const forecast: { month: string; predicted: number; lower: number; upper: number }[] = [];
    for (let i = 1; i <= 6; i++) {
      const fDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthName = fDate.toLocaleString('en', { month: 'short', year: '2-digit' });
      const predicted = Math.max(0, Math.round(slope * (n - 1 + i) + intercept));
      // Confidence intervals widen over time
      const variance = Math.abs(slope) * i * 0.3 + yMean * 0.05;
      forecast.push({
        month: monthName,
        predicted,
        lower: Math.max(0, Math.round(predicted - variance)),
        upper: Math.round(predicted + variance),
      });
    }

    // 5. Revenue by source
    const invoiceBreakdown = await db.invoice.groupBy({
      by: ['status'],
      where: orgFilterStrict,
      _sum: { total: true, tax: true },
      _count: true,
    });

    // 6. Growth metrics
    const lastMonth = historicalRevenue[historicalRevenue.length - 1]?.revenue || 0;
    const prevMonth = historicalRevenue[historicalRevenue.length - 2]?.revenue || 0;
    const momGrowth = prevMonth > 0 ? ((lastMonth - prevMonth) / prevMonth * 100) : 0;

    const last3Avg = historicalRevenue.slice(-3).reduce((s, m) => s + m.revenue, 0) / 3;
    const prev3Avg = historicalRevenue.slice(-6, -3).length > 0
      ? historicalRevenue.slice(-6, -3).reduce((s, m) => s + m.revenue, 0) / 3
      : last3Avg;
    const qoqGrowth = prev3Avg > 0 ? ((last3Avg - prev3Avg) / prev3Avg * 100) : 0;

    // 7. Churn risk (invoices overdue)
    const overdueInvoices = await db.invoice.findMany({
      where: { ...orgFilterStrict, status: 'overdue' },
      include: { organization: { select: { name: true } } },
    });

    return NextResponse.json({
      summary: {
        monthlyRecurring,
        annualRecurring,
        pipelineMonthlyPotential,
        totalPipelineVehicles: estPipelineVehicles,
        momGrowth: Math.round(momGrowth * 10) / 10,
        qoqGrowth: Math.round(qoqGrowth * 10) / 10,
        activeSubscriptions: subscriptions.length,
        totalSubscribedVehicles: subscriptions.reduce((s, sub) => s + sub.vehicleCount, 0),
        overdueCount: overdueInvoices.length,
        overdueAmount: overdueInvoices.reduce((s, inv) => s + Number(inv.total), 0);
      },
      historicalRevenue,
      forecast,
      subscriptions: subscriptions.map(s => ({
        id: s.id,
        organization: s.organization.name,
        plan: s.plan.name,
        vehicleCount: s.vehicleCount,
        monthlyAmount: Number(s.plan.priceMonthly) * s.vehicleCount,
        startsAt: s.startsAt,
        endsAt: s.endsAt,
      })),
      invoiceBreakdown: invoiceBreakdown.map(b => ({
        status: b.status,
        total: Number(b._sum.total || 0),
        tax: Number(b._sum.tax || 0),
        count: b._count,
      })),
      churnRisks: overdueInvoices.map(inv => ({
        id: inv.id,
        organization: inv.organization.name,
        amount: inv.total,
        dueDate: inv.dueDate,
        invoiceNumber: inv.invoiceNumber,
      })),
    });
  } catch (err) {
    logger.error('Revenue forecast error', { err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
