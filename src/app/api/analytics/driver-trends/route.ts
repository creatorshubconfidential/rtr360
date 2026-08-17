import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const orgFilter = user.role === 'super_admin' ? {} : { organizationId: user.organizationId! };

    // 1. Driver full data with trip aggregation
    const drivers = await db.driver.findMany({
      where: orgFilter,
      include: {
        vehicles: { select: { id: true, plateNumber: true, vehicleType: true } },
        _count: { select: { vehicles: true } },
      },
      orderBy: { score: 'desc' },
    });

    // Build driver→vehicleId map so we can match trips to drivers via vehicle
    const driverVehicleIds = new Map<string, string[]>();
    drivers.forEach(d => {
      driverVehicleIds.set(d.name, (driverVehicleIds.get(d.name) || []));
      d.vehicles.forEach(v => {
        const ids = driverVehicleIds.get(d.name) || [];
        ids.push(v.id);
        driverVehicleIds.set(d.name, ids);
      });
    });

    // 2. Trip-level analytics grouped by driverName (Trip has driverName, not driverId)
    const driverTrips = await db.trip.groupBy({
      by: ['driverName'],
      where: {
        ...(user.role === 'super_admin' ? {} : { organizationId: user.organizationId! }),
        driverName: { not: null },
      },
      _count: true,
      _avg: { distance: true, duration: true, maxSpeed: true, avgSpeed: true, idleTime: true, harshBrakes: true, harshAccel: true, overspeedCount: true },
      _sum: { distance: true, duration: true, idleTime: true, harshBrakes: true, harshAccel: true, overspeedCount: true },
      _min: { startTime: true },
      _max: { startTime: true },
    });

    // Map driver name → trip data
    const tripMap = new Map(driverTrips.map(d => [d.driverName || 'Unknown', d]));

    // 3. Build driver profiles
    const driverProfiles = drivers.map(d => {
      const trips = tripMap.get(d.name);
      const totalTrips = trips?._count ?? 0;
      const totalDistance = Number(trips?._sum?.distance ?? 0);
      const avgSpeed = Number(trips?._avg?.avgSpeed ?? 0);
      const avgHarshBrakes = Number(trips?._avg?.harshBrakes ?? 0);
      const avgHarshAccel = Number(trips?._avg?.harshAccel ?? 0);
      const avgOverspeed = Number(trips?._avg?.overspeedCount ?? 0);
      const totalIdleMinutes = Number(trips?._sum?.idleTime ?? 0);
      const totalDuration = Number(trips?._sum?.duration ?? 0);
      const avgDistance = Number(trips?._avg?.distance ?? 0);

      // Risk categories
      let riskLevel = 'low';
      if (d.score < 40 || avgHarshBrakes > 3 || avgOverspeed > 5) riskLevel = 'high';
      else if (d.score < 60 || avgHarshBrakes > 1.5 || avgOverspeed > 2) riskLevel = 'medium';

      // Trend: use score relative to fleet average, improved with trip activity data
      let trend: 'improving' | 'stable' | 'declining' = 'stable';
      if (totalTrips >= 3) {
        const firstTripDate = trips?._min?.startTime;
        const lastTripDate = trips?._max?.startTime;
        const daySpan = firstTripDate && lastTripDate
          ? (lastTripDate.getTime() - firstTripDate.getTime()) / (1000 * 60 * 60 * 24)
          : 0;

        if (daySpan > 7) {
          const avgFleetScore = drivers.length > 0 ? drivers.reduce((s, dr) => s + dr.score, 0) / drivers.length : 50;
          if (d.score > avgFleetScore + 10) trend = 'improving';
          else if (d.score < avgFleetScore - 10) trend = 'declining';
        }
      }

      return {
        id: d.id,
        name: d.name,
        phone: d.phone,
        emirate: d.emirate,
        nationality: d.nationality,
        licenseType: d.licenseType,
        licenseExpiry: d.licenseExpiry,
        status: d.status,
        score: d.score,
        totalTrips,
        totalDistance,
        avgSpeed: Math.round(avgSpeed * 10) / 10,
        avgDistancePerTrip: Math.round(avgDistance * 10) / 10,
        avgHarshBrakes: Math.round(avgHarshBrakes * 100) / 100,
        avgHarshAccel: Math.round(avgHarshAccel * 100) / 100,
        avgOverspeed: Math.round(avgOverspeed * 100) / 100,
        totalHarshBrakes: Number(trips?._sum?.harshBrakes ?? 0),
        totalHarshAccel: Number(trips?._sum?.harshAccel ?? 0),
        totalOverspeed: Number(trips?._sum?.overspeedCount ?? 0),
        idleRatio: totalTrips > 0 && totalDuration > 0 ? Math.round((totalIdleMinutes / totalDuration) * 100) : 0,
        riskLevel,
        trend,
        vehicleCount: d._count.vehicles,
        assignedVehicle: d.vehicles[0] || null,
      };
    });

    // Sort by score descending
    driverProfiles.sort((a, b) => b.score - a.score);

    // 4. Aggregate statistics
    const avgFleetScore = driverProfiles.length > 0
      ? Math.round(driverProfiles.reduce((s, d) => s + d.score, 0) / driverProfiles.length)
      : 0;

    const riskDistribution = ['low', 'medium', 'high'].map(r => ({
      risk: r,
      count: driverProfiles.filter(d => d.riskLevel === r).length,
    }));

    const trendDistribution = ['improving', 'stable', 'declining'].map(t => ({
      trend: t,
      count: driverProfiles.filter(d => d.trend === t).length,
    }));

    // 5. Behavior leaderboard
    const violationLeaderboard = [...driverProfiles]
      .sort((a, b) => (b.totalHarshBrakes + b.totalHarshAccel + b.totalOverspeed) - (a.totalHarshBrakes + a.totalHarshAccel + a.totalOverspeed))
      .slice(0, 10)
      .map(d => ({
        name: d.name,
        totalViolations: d.totalHarshBrakes + d.totalHarshAccel + d.totalOverspeed,
        harshBrakes: d.totalHarshBrakes,
        harshAccel: d.totalHarshAccel,
        overspeed: d.totalOverspeed,
        score: d.score,
        riskLevel: d.riskLevel,
      }));

    // 6. Score distribution histogram
    const scoreBuckets = [
      { range: '0-20', min: 0, max: 20, count: 0 },
      { range: '21-40', min: 21, max: 40, count: 0 },
      { range: '41-60', min: 41, max: 60, count: 0 },
      { range: '61-80', min: 61, max: 80, count: 0 },
      { range: '81-100', min: 81, max: 100, count: 0 },
    ];
    driverProfiles.forEach(d => {
      const bucket = scoreBuckets.find(b => d.score >= b.min && d.score <= b.max);
      if (bucket) bucket.count++;
    });

    return NextResponse.json({
      avgFleetScore,
      driverCount: driverProfiles.length,
      drivers: driverProfiles,
      riskDistribution,
      trendDistribution,
      violationLeaderboard,
      scoreDistribution: scoreBuckets,
    });
  } catch (err) {
    logger.error('Driver trends error', { err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
