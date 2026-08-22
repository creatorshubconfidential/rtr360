import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { requirePermission, REPORTS_READ } from '@/lib/permissions';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // SECURITY: RBAC — only roles with reports.read permission can access dashboard reports
    const permErr = requirePermission(user, REPORTS_READ);
    if (permErr) return permErr;

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '6months';

    const now = new Date();
    let startDate: Date;
    switch (period) {
      case '1month': startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1); break;
      case '3months': startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1); break;
      case '6months': startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1); break;
      case '12months': startDate = new Date(now.getFullYear(), now.getMonth() - 12, 1); break;
      default: startDate = new Date(2024, 0, 1);
    }

    const orgFilter = user.role === 'super_admin' ? {} : { organizationId: user.organizationId! };
    const orgFilterStrict = user.role === 'super_admin' ? {} : { organizationId: user.organizationId! };

    // 1. Revenue metrics
    const [paidInvoices, pendingInvoices, overdueInvoices] = await Promise.all([
      db.invoice.findMany({ where: { ...orgFilterStrict, status: 'paid', createdAt: { gte: startDate } } }),
      db.invoice.findMany({ where: { ...orgFilterStrict, status: 'pending', createdAt: { gte: startDate } } }),
      db.invoice.findMany({ where: { ...orgFilterStrict, status: 'overdue', createdAt: { gte: startDate } } }),
    ]);
    const totalRevenue = paidInvoices.reduce((s, i) => s + Number(i.total), 0);
    const pendingRevenue = pendingInvoices.reduce((s, i) => s + Number(i.total), 0);
    const overdueRevenue = overdueInvoices.reduce((s, i) => s + Number(i.total), 0);

    // Monthly revenue — single batch of parallel aggregate queries (was N+1 sequential loop)
    const monthlyRevenue = await Promise.all(
      Array.from({ length: 6 }, (_, idx) => {
        const i = 5 - idx;
        const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const monthName = mStart.toLocaleString('en', { month: 'short', year: '2-digit' });
        return db.invoice
          .aggregate({
            where: { ...orgFilterStrict, status: 'paid', createdAt: { gte: mStart, lt: mEnd } },
            _sum: { total: true },
            _count: true,
          })
          .then((r) => ({ month: monthName, revenue: Number(r._sum?.total ?? 0), invoices: r._count }));
      }),
    );

    // 2. Fleet metrics
    const [totalVehicles, activeVehicles, vehiclesByType] = await Promise.all([
      db.vehicle.count({ where: orgFilter }),
      db.vehicle.count({ where: { ...orgFilter, status: 'active' } }),
      db.vehicle.groupBy({ by: ['vehicleType'], where: orgFilter, _count: { vehicleType: true } }),
    ]);

    // 3. Maintenance metrics
    const [totalMaintenance, maintenanceCost, maintenanceByStatus, maintenanceByType] = await Promise.all([
      db.maintenanceRecord.count({ where: { ...orgFilterStrict, createdAt: { gte: startDate } } }),
      db.maintenanceRecord.aggregate({ where: { ...orgFilterStrict, status: 'completed', createdAt: { gte: startDate } }, _sum: { cost: true } }),
      db.maintenanceRecord.groupBy({ by: ['status'], where: { ...orgFilterStrict, createdAt: { gte: startDate } }, _count: { status: true } }),
      db.maintenanceRecord.groupBy({ by: ['type'], where: { ...orgFilterStrict, createdAt: { gte: startDate } }, _count: { type: true } }),
    ]);

    // Monthly maintenance — single batch of parallel aggregate queries (was N+1 sequential loop)
    const monthlyMaintenance = await Promise.all(
      Array.from({ length: 6 }, (_, idx) => {
        const i = 5 - idx;
        const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
        const monthName = mStart.toLocaleString('en', { month: 'short', year: '2-digit' });
        return db.maintenanceRecord
          .aggregate({
            where: { ...orgFilterStrict, status: 'completed', completedDate: { gte: mStart, lt: mEnd } },
            _sum: { cost: true },
            _count: true,
          })
          .then((r) => ({ month: monthName, cost: Number(r._sum?.cost ?? 0), count: r._count }));
      }),
    );

    // 4. Lead funnel
    const leadFunnel = await db.lead.groupBy({
      by: ['status'],
      where: { ...orgFilter, createdAt: { gte: startDate } },
      _count: { status: true },
    });
    const [totalLeads, wonLeads] = await Promise.all([
      db.lead.count({ where: { ...orgFilter, createdAt: { gte: startDate } } }),
      db.lead.count({ where: { ...orgFilter, status: 'won', createdAt: { gte: startDate } } }),
    ]);
    const conversionRate = totalLeads > 0 ? ((wonLeads / totalLeads) * 100).toFixed(1) : '0';

    // 5. Driver performance
    const drivers = await db.driver.findMany({
      where: orgFilter,
      select: { name: true, score: true, totalTrips: true, totalDistance: true, totalViolations: true },
      orderBy: { score: 'desc' },
      take: 10,
    });

    // 6. Trip metrics
    const [totalTrips, tripAgg] = await Promise.all([
      db.trip.count({ where: { ...orgFilter, startTime: { gte: startDate } } }),
      db.trip.aggregate({ where: { ...orgFilter, startTime: { gte: startDate } }, _sum: { distance: true, duration: true } }),
    ]);

    // 7. Support metrics
    const [ticketByStatus, ticketByPriority] = await Promise.all([
      db.ticket.groupBy({ by: ['status'], where: { ...orgFilterStrict, createdAt: { gte: startDate } }, _count: { status: true } }),
      db.ticket.groupBy({ by: ['priority'], where: { ...orgFilterStrict, createdAt: { gte: startDate } }, _count: { priority: true } }),
    ]);

    // 8. Device / installation metrics
    const [devicesByStatus, installationsByStatus] = await Promise.all([
      db.device.groupBy({ by: ['status'], where: orgFilter, _count: { status: true } }),
      db.installation.groupBy({ by: ['status'], where: { ...orgFilterStrict, createdAt: { gte: startDate } }, _count: { status: true } }),
    ]);

    return NextResponse.json({
      period,
      summary: {
        totalRevenue, pendingRevenue, overdueRevenue,
        totalVehicles, activeVehicles,
        totalMaintenance, totalMaintenanceCost: Number(maintenanceCost._sum?.cost ?? 0),
        totalLeads, conversionRate,
        totalTrips, totalDistance: tripAgg._sum?.distance ?? 0,
      },
      monthlyRevenue,
      monthlyMaintenance,
      vehiclesByType: vehiclesByType.map(v => ({ type: v.vehicleType || 'Unknown', count: v._count?.vehicleType ?? 0 })),
      maintenanceByStatus: maintenanceByStatus.map(m => ({ status: m.status, count: m._count.status })),
      maintenanceByType: maintenanceByType.map(m => ({ type: m.type, count: m._count.type })),
      leadFunnel: leadFunnel.map(l => ({ status: l.status, count: l._count.status })),
      drivers: drivers.map(d => ({ name: d.name, score: d.score, totalTrips: d.totalTrips, totalDistance: d.totalDistance, totalViolations: d.totalViolations })),
      ticketByStatus: ticketByStatus.map(t => ({ status: t.status, count: t._count.status })),
      ticketByPriority: ticketByPriority.map(t => ({ priority: t.priority, count: t._count.priority })),
      devicesByStatus: devicesByStatus.map(d => ({ status: d.status, count: d._count.status })),
      installationsByStatus: installationsByStatus.map(i => ({ status: i.status, count: i._count.status })),
    });
  } catch (error) {
    logger.error('Reports GET error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
