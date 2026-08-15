import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { verifySession } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/admin/organizations/[id]/usage — Per-org usage analytics
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const authHeader = request.headers.get('Authorization');
    const cookieHeader = request.headers.get('Cookie');
    let token: string | null = null;
    if (authHeader) token = authHeader.replace('Bearer ', '');
    if (!token && cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)rtr_session=([^;]*)/);
      if (match) token = decodeURIComponent(match[1]);
    }
    const session = await verifySession(token || '');
    if (!session || session.role !== 'super_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    const org = await db.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        planName: true,
        vehicleLimit: true,
        userLimit: true,
        featureFlags: true,
        whiteLabelEnabled: true,
      },
    });

    if (!org) return Response.json({ error: 'Organization not found' }, { status: 404 });

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d'; // 7d, 30d, 90d
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Parallel queries for usage data
    const [
      vehicleCount,
      activeVehicleCount,
      userCount,
      activeUserCount,
      driverCount,
      deviceCount,
      installedDeviceCount,
      tripCount,
      tripAgg,
      leadCount,
      wonLeadCount,
      ticketCount,
      openTicketCount,
      invoiceCount,
      invoiceAgg,
      paidInvoiceAgg,
      overdueInvoiceAgg,
      maintenanceCount,
      openMaintenanceCount,
      alertCount,
      activeSubscription,
      recentLogins,
    ] = await Promise.all([
      db.vehicle.count({ where: { organizationId: id } }),
      db.vehicle.count({ where: { organizationId: id, status: 'active' } }),
      db.user.count({ where: { organizationId: id } }),
      db.user.count({ where: { organizationId: id, status: 'active' } }),
      db.driver.count({ where: { organizationId: id } }),
      db.device.count({ where: { organizationId: id } }),
      db.device.count({ where: { organizationId: id, status: 'installed' } }),
      db.trip.count({ where: { vehicle: { organizationId: id }, createdAt: { gte: since } } }),
      db.trip.aggregate({
        _sum: { distance: true, duration: true },
        where: { vehicle: { organizationId: id }, createdAt: { gte: since } },
      }),
      db.lead.count({ where: { organizationId: id, createdAt: { gte: since } } }),
      db.lead.count({ where: { organizationId: id, status: 'won', createdAt: { gte: since } } }),
      db.ticket.count({ where: { organizationId: id, createdAt: { gte: since } } }),
      db.ticket.count({ where: { organizationId: id, status: { in: ['open', 'in_progress'] } } }),
      db.invoice.count({ where: { organizationId: id, createdAt: { gte: since } } }),
      db.invoice.aggregate({
        _sum: { total: true },
        where: { organizationId: id, createdAt: { gte: since } },
      }),
      db.invoice.aggregate({
        _sum: { total: true },
        where: { organizationId: id, status: 'paid', createdAt: { gte: since } },
      }),
      db.invoice.aggregate({
        _sum: { total: true },
        where: { organizationId: id, status: 'overdue' },
      }),
      db.maintenanceRecord.count({ where: { vehicle: { organizationId: id }, createdAt: { gte: since } } }),
      db.maintenanceRecord.count({ where: { vehicle: { organizationId: id }, status: { in: ['pending', 'in_progress'] } } }),
      db.alert.count({ where: { organizationId: id, createdAt: { gte: since } } }),
      db.subscription.findFirst({
        where: { organizationId: id, status: 'active' },
        include: { plan: true },
      }),
      // Recent login activity (last 30 days)
      db.user.findMany({
        where: { organizationId: id, lastLoginAt: { gte: since } },
        select: { id: true, name: true, email: true, lastLoginAt: true },
        orderBy: { lastLoginAt: 'desc' },
        take: 10,
      }),
    ]);

    // Daily activity (trips + alerts) for the period
    const dailyActivity = await getDailyActivity(id, days);

    // Feature usage summary
    const featureUsage = {
      liveTracking: installedDeviceCount > 0,
      crm: leadCount > 0,
      maintenance: maintenanceCount > 0,
      invoicing: invoiceCount > 0,
      aiAssistant: true, // Always available
      analytics: true, // Always available
      geofencing: await db.geofence.count({ where: { organizationId: id } }) > 0,
      alertRules: await db.alertRule.count({ where: { organizationId: id } }) > 0,
    };

    return Response.json({
      data: {
        organization: org,
        period,
        vehicles: {
          total: vehicleCount,
          active: activeVehicleCount,
          limit: org.vehicleLimit,
          utilization: org.vehicleLimit > 0 ? Math.round((vehicleCount / org.vehicleLimit) * 100) : 0,
        },
        users: {
          total: userCount,
          active: activeUserCount,
          limit: org.userLimit,
          utilization: org.userLimit > 0 ? Math.round((userCount / org.userLimit) * 100) : 0,
        },
        drivers: { total: driverCount },
        devices: {
          total: deviceCount,
          installed: installedDeviceCount,
        },
        trips: {
          total: tripCount,
          totalDistance: tripAgg._sum.distance || 0,
          totalDuration: tripAgg._sum.duration || 0,
          avgDistance: tripCount > 0 ? Math.round((tripAgg._sum.distance || 0) / tripCount) : 0,
        },
        leads: {
          total: leadCount,
          won: wonLeadCount,
          winRate: leadCount > 0 ? Math.round((wonLeadCount / leadCount) * 100) : 0,
        },
        tickets: {
          total: ticketCount,
          open: openTicketCount,
        },
        invoices: {
          total: invoiceCount,
          totalAmount: invoiceAgg._sum.total || 0,
          paidAmount: paidInvoiceAgg._sum.total || 0,
          overdueAmount: overdueInvoiceAgg._sum.total || 0,
        },
        maintenance: {
          total: maintenanceCount,
          open: openMaintenanceCount,
        },
        alerts: { total: alertCount },
        subscription: activeSubscription,
        featureUsage,
        dailyActivity,
        recentLogins,
      },
    });
  } catch (error: unknown) {
    console.error('Usage analytics error:', error);
    return Response.json({ error: 'Failed to fetch usage analytics' }, { status: 500 });
  }
}

async function getDailyActivity(orgId: string, days: number) {
  const data: { date: string; trips: number; alerts: number }[] = [];
  const now = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [tripCount, alertCount] = await Promise.all([
      db.trip.count({
        where: {
          vehicle: { organizationId: orgId },
          createdAt: { gte: dayStart, lt: dayEnd },
        },
      }),
      db.alert.count({
        where: {
          organizationId: orgId,
          createdAt: { gte: dayStart, lt: dayEnd },
        },
      }),
    ]);

    data.push({
      date: dayStart.toISOString().split('T')[0],
      trips: tripCount,
      alerts: alertCount,
    });
  }

  return data;
}
