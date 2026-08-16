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

    // 2. Trip-level driver analytics
    const driverTrips = await db.trip.groupBy({
      by: ['driverName'],
      where: user.role === 'super_admin' ? {} : { organizationId: user.organizationId! },
      _count: true,
      _avg: { distance: true, duration: true, maxSpeed: true, avgSpeed: true, idleTime: true, harshBrakes: true, harshAccel: true, overspeedCount: true },
      _sum: { distance: true, duration: true, idleTime: true, harshBrakes: true, harshAccel: true, overspeedCount: true },
    });

    const tripMap = new Map(driverTrips.map(d => [d.driverName || 'Unknown', d]));

    // 3. Build driver profiles
    const driverProfiles = drivers.map(d => {
      const trips = tripMap.get(d.name);
      const totalTrips = trips?._count ?? 0;
      const totalDistance = trips?._sum?.distance ?? 0;
      const avgSpeed = trips?._avg?.avgSpeed ?? 0;
      const avgHarshBrakes = trips?._avg?.harshBrakes ?? 0;
      const avgHarshAccel = trips?._avg?.harshAccel ?? 0;
      const avgOverspeed = trips?._avg?.overspeedCount ?? 0;
      const totalIdleMinutes = trips?._sum?.idleTime ?? 0;
      const avgDistance = trips?._avg?.distance ?? 0;

      // Risk categories
      let riskLevel = 'low';
      if (d.score < 40 || avgHarshBrakes > 3 || avgOverspeed > 5) riskLevel = 'high';
      else if (d.score < 60 || avgHarshBrakes > 1.5 || avgOverspeed > 2) riskLevel = 'medium';

      // Trend (simulated from score - compare to average)
      const avgFleetScore = drivers.reduce((s, dr) => s + dr.score, 0) / drivers.length;
      let trend: 'improving' | 'stable' | 'declining' = 'stable';
      if (d.score > avgFleetScore + 10) trend = 'improving';
      else if (d.score < avgFleetScore - 10) trend = 'declining';

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
        totalHarshBrakes: trips?._sum?.harshBrakes ?? 0,
        totalHarshAccel: trips?._sum?.harshAccel ?? 0,
        totalOverspeed: trips?._sum?.overspeedCount ?? 0,
        idleRatio: totalTrips > 0 ? Math.round((totalIdleMinutes / (trips?._sum?.duration ?? 1)) * 100) : 0,
        riskLevel,
        trend,
        vehicleCount: d._count.vehicles,
        assignedVehicle: d.vehicles[0] || null,
      };
    });

    // Sort by score descending (best first)
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

    // 5. Behavior leaderboard (top violations)
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
