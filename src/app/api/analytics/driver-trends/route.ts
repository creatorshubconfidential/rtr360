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
    drivers.forEach((d: {name:string;vehicles:{id:string}[]}) => {
      driverVehicleIds.set(d.name, (driverVehicleIds.get(d.name) || []));
      d.vehicles.forEach((v: {id:string}) => {
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
    const tripMap = new Map<string, Record<string, unknown>>(driverTrips.map((d: {driverName:string|null}) => [d.driverName || 'Unknown', d] as [string, Record<string, unknown>]));

    // 3. Build driver profiles
    const driverProfiles = drivers.map((d: {id:string;name:string;phone:string|null;emirate:string|null;nationality:string|null;licenseType:string|null;licenseExpiry:Date|null;status:string;score:number;vehicles:{id:string;plateNumber:string;vehicleType:string|null}[];_count:{vehicles:number}}) => {
      const trips = tripMap.get(d.name);
      const tripsCount = (trips as Record<string, unknown> | undefined)?._count as number | undefined;
      const tripsSum = (trips as Record<string, unknown> | undefined)?._sum as Record<string, unknown> | undefined;
      const tripsAvg = (trips as Record<string, unknown> | undefined)?._avg as Record<string, unknown> | undefined;
      const totalTrips = tripsCount ?? 0;
      const totalDistance = Number(tripsSum?.distance ?? 0);
      const avgSpeed = Number(tripsAvg?.avgSpeed ?? 0);
      const avgHarshBrakes = Number(tripsAvg?.harshBrakes ?? 0);
      const avgHarshAccel = Number(tripsAvg?.harshAccel ?? 0);
      const avgOverspeed = Number(tripsAvg?.overspeedCount ?? 0);
      const totalIdleMinutes = Number(tripsSum?.idleTime ?? 0);
      const totalDuration = Number(tripsSum?.duration ?? 0);
      const avgDistance = Number(tripsAvg?.distance ?? 0);

      // Risk categories
      let riskLevel = 'low';
      if (d.score < 40 || avgHarshBrakes > 3 || avgOverspeed > 5) riskLevel = 'high';
      else if (d.score < 60 || avgHarshBrakes > 1.5 || avgOverspeed > 2) riskLevel = 'medium';

      // Trend: use score relative to fleet average, improved with trip activity data
      let trend: 'improving' | 'stable' | 'declining' = 'stable';
      if (totalTrips >= 3) {
        const firstTripDate = (trips as Record<string, Record<string, unknown>> | undefined)?._min?.startTime as Date | undefined;
        const lastTripDate = (trips as Record<string, Record<string, unknown>> | undefined)?._max?.startTime as Date | undefined;
        const daySpan = firstTripDate && lastTripDate
          ? (lastTripDate.getTime() - firstTripDate.getTime()) / (1000 * 60 * 60 * 24)
          : 0;

        if (daySpan > 7) {
          const avgFleetScore = drivers.length > 0 ? drivers.reduce((s: number, dr: {score:number}) => s + dr.score, 0) / drivers.length : 50;
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
        totalHarshBrakes: Number(tripsSum?.harshBrakes ?? 0),
        totalHarshAccel: Number(tripsSum?.harshAccel ?? 0),
        totalOverspeed: Number(tripsSum?.overspeedCount ?? 0),
        idleRatio: totalTrips > 0 && totalDuration > 0 ? Math.round((totalIdleMinutes / totalDuration) * 100) : 0,
        riskLevel,
        trend,
        vehicleCount: d._count.vehicles,
        assignedVehicle: d.vehicles[0] || null,
      };
    });

    // Sort by score descending
    driverProfiles.sort((a: {score:number}, b: {score:number}) => b.score - a.score);

    // 4. Aggregate statistics
    const avgFleetScore = driverProfiles.length > 0
      ? Math.round(driverProfiles.reduce((s: number, d: {score:number}) => s + d.score, 0) / driverProfiles.length)
      : 0;

    const riskDistribution = ['low', 'medium', 'high'].map((r: string) => ({
      risk: r,
      count: driverProfiles.filter((d: {riskLevel:string}) => d.riskLevel === r).length,
    }));

    const trendDistribution = ['improving', 'stable', 'declining'].map((t: string) => ({
      trend: t,
      count: driverProfiles.filter((d: {trend:string}) => d.trend === t).length,
    }));

    // 5. Behavior leaderboard
    const violationLeaderboard = [...driverProfiles]
      .sort((a: {totalHarshBrakes:number;totalHarshAccel:number;totalOverspeed:number}, b: {totalHarshBrakes:number;totalHarshAccel:number;totalOverspeed:number}) => (b.totalHarshBrakes + b.totalHarshAccel + b.totalOverspeed) - (a.totalHarshBrakes + a.totalHarshAccel + a.totalOverspeed))
      .slice(0, 10)
      .map((d: {name:string;totalHarshBrakes:number;totalHarshAccel:number;totalOverspeed:number;score:number;riskLevel:string}) => ({
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
    driverProfiles.forEach((d: {score:number}) => {
      const bucket = scoreBuckets.find((b: {min:number;max:number}) => d.score >= b.min && d.score <= b.max);
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
