
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

import { requirePermission, ADMIN_MANAGE } from '@/lib/permissions';
export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: ADMIN_MANAGE
    const permErr = requirePermission(user, ADMIN_MANAGE);
    if (permErr) return permErr;

    const [
      totalOrgs,
      activeOrgs,
      totalUsers,
      totalVehicles,
      totalDevices,
      totalDrivers,
      totalTrips,
      totalLeads,
      openTickets,
      activeSubscriptions,
      totalInvoices,
      paidInvoices,
      overdueInvoices,
      orgStats,
      monthlyOrgGrowth,
    ] = await Promise.all([
      db.organization.count(),
      db.organization.count({ where: { status: 'active' } }),
      db.user.count(),
      db.vehicle.count(),
      db.device.count(),
      db.driver.count(),
      db.trip.count(),
      db.lead.count(),
      db.ticket.count({ where: { status: { in: ['open', 'in_progress'] } } }),
      db.subscription.count({ where: { status: 'active' } }),
      db.invoice.count(),
      db.invoice.count({ where: { status: 'paid' } }),
      db.invoice.count({ where: { status: 'overdue' } }),
      // Per-org stats for table
      db.organization.findMany({
        select: {
          id: true,
          name: true,
          tradeName: true,
          emirate: true,
          status: true,
          planName: true,
          vehicleLimit: true,
          userLimit: true,
          createdAt: true,
          _count: {
            select: {
              users: true,
              vehicles: true,
              devices: true,
              drivers: true,
              branches: true,
              invoices: true,
              tickets: true,
              leads: true,
              subscriptions: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Monthly org growth (last 6 months)
      getMonthlyOrgGrowth(),
    ]);

    // Revenue aggregates from invoices
    const revenueAgg = await db.invoice.aggregate({
      _sum: { total: true },
      where: { status: 'paid' },
    });
    const totalRevenue = revenueAgg._sum.total || 0;

    // Outstanding (pending + overdue)
    const outstandingAgg = await db.invoice.aggregate({
      _sum: { total: true },
      where: { status: { in: ['pending', 'overdue'] } },
    });
    const outstandingRevenue = outstandingAgg._sum.total || 0;

    // White-label enabled count
    const whiteLabelOrgs = await db.organization.count({
      where: { whiteLabelEnabled: true },
    });

    return Response.json({
      summary: {
        totalOrgs,
        activeOrgs,
        inactiveOrgs: totalOrgs - activeOrgs,
        totalUsers,
        totalVehicles,
        totalDevices,
        totalDrivers,
        totalTrips,
        totalLeads,
        openTickets,
        activeSubscriptions,
        totalInvoices,
        paidInvoices,
        overdueInvoices,
        totalRevenue,
        outstandingRevenue,
        whiteLabelOrgs,
      },
      organizations: orgStats,
      monthlyGrowth: monthlyOrgGrowth,
    });
  } catch (error: any) {
    console.error('Platform stats error:', error);
    return Response.json({ error: 'Failed to fetch platform stats' }, { status: 500 });
  }
}

async function getMonthlyOrgGrowth() {
  const months: { month: string; count: number; cumulative: number }[] = [];
  const now = new Date();

  for (let i = 5; i >= 0; i--) {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
    const monthLabel = startOfMonth.toLocaleString('en', { month: 'short', year: '2-digit' });

    const count = await db.organization.count({
      where: {
        createdAt: { gte: startOfMonth, lte: endOfMonth },
      },
    });

    const cumulative = await db.organization.count({
      where: {
        createdAt: { lte: endOfMonth },
      },
    });

    months.push({ month: monthLabel, count, cumulative });
  }

  return months;
}
