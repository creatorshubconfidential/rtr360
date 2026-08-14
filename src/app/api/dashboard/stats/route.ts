import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const { user, error } = await getAuthUser(request);
    if (error) return error;

    const orgFilter:
      | { organizationId: string }
      | Record<string, never> =
      user.role !== 'super_admin' && user.organizationId
        ? { organizationId: user.organizationId }
        : {};

    // For super_admin, count across all organizations (no org filter)
    const vehicleFilter =
      user.role === 'super_admin' ? {} : orgFilter;

    const [
      totalVehicles,
      activeVehicles,
      totalDrivers,
      totalLeads,
      openAlerts,
      openTickets,
      totalDevices,
      pendingInstallations,
      activeTechnicians,
    ] = await Promise.all([
      db.vehicle.count({ where: vehicleFilter }),
      db.vehicle.count({
        where: { ...vehicleFilter, status: 'active' },
      }),
      db.driver.count({ where: vehicleFilter }),
      db.lead.count({ where: orgFilter }),
      db.alert.count({
        where: { ...vehicleFilter, status: 'open' },
      }),
      db.ticket.count({
        where: { ...vehicleFilter, status: 'open' },
      }),
      db.device.count({
        where: user.role === 'super_admin' ? {} : { OR: [{ ...orgFilter }, { organizationId: null, status: 'warehouse' }] },
      }),
      db.installation.count({
        where: { ...orgFilter, status: { in: ['scheduled', 'in_progress', 'testing'] } },
      }),
      db.technician.count({
        where: { ...orgFilter, status: 'active' },
      }),
    ]);

    // Today's trips: get all vehicles in scope, then count today's trips
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const vehicleIdsForTrips =
      user.role === 'super_admin'
        ? undefined // no filter
        : (
            await db.vehicle.findMany({
              where: vehicleFilter,
              select: { id: true },
            })
          ).map((v) => v.id);

    const tripFilter: Record<string, unknown> = {
      startTime: { gte: todayStart, lte: todayEnd },
    };
    if (vehicleIdsForTrips) {
      tripFilter.vehicleId = { in: vehicleIdsForTrips };
    }

    const todayTrips = await db.trip.count({
      where: tripFilter,
    });

    // Total distance across all vehicles in scope
    const totalDistanceResult = await db.vehicle.aggregate({
      _sum: { mileage: true },
      where: vehicleFilter,
    });
    const totalDistance = totalDistanceResult._sum.mileage ?? 0;

    return NextResponse.json({
      totalVehicles,
      activeVehicles,
      totalDrivers,
      totalLeads,
      openAlerts,
      openTickets,
      todayTrips,
      totalDistance: Math.round(totalDistance),
      totalDevices,
      pendingInstallations,
      activeTechnicians,
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
