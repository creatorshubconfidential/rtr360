import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const orgFilter = user.role === 'super_admin' ? {} : { organizationId: user.organizationId! };

    // 1. All vehicles with maintenance history
    const vehicles = await db.vehicle.findMany({
      where: orgFilter,
      include: {
        maintenanceRecords: {
          orderBy: { createdAt: 'desc' },
        },
        trips: {
          orderBy: { startTime: 'desc' },
          take: 20,
          select: { distance: true, duration: true, startTime: true },
        },
      },
    });

    // 2. Completed maintenance aggregation
    const completedMaint = await db.maintenanceRecord.findMany({
      where: { ...orgFilter, status: 'completed', cost: { not: null } },
    });

    // 3. Predictions per vehicle
    const predictions = vehicles.map(v => {
      const records = v.maintenanceRecords;
      const completed = records.filter(r => r.status === 'completed');
      const totalCost = completed.reduce((s, r) => s + (r.cost || 0), 0);
      const avgCost = completed.length > 0 ? totalCost / completed.length : 0;

      // Recent trip distance
      const recentDistance = v.trips.slice(0, 10).reduce((s, t) => s + (t.distance || 0), 0);
      const avgTripDist = v.trips.length > 0 ? recentDistance / Math.min(v.trips.length, 10) : 0;

      // Maintenance frequency (days between completed records)
      let avgFrequencyDays = 90; // default
      if (completed.length >= 2) {
        const dates = completed
          .filter(r => r.completedDate)
          .map(r => new Date(r.completedDate!).getTime())
          .sort((a, b) => b - a);
        if (dates.length >= 2) {
          const gaps: number[] = [];
          for (let i = 0; i < dates.length - 1; i++) gaps.push((dates[i] - dates[i + 1]) / 86400000);
          avgFrequencyDays = gaps.reduce((s: number, g: number) => s + g, 0) / gaps.length;
        }
      }

      // Next maintenance prediction
      const lastCompleted = completed.find(r => r.completedDate);
      const lastDate = lastCompleted?.completedDate ? new Date(lastCompleted.completedDate) : new Date(v.createdAt);
      const daysSinceLast = (Date.now() - lastDate.getTime()) / 86400000;
      const daysUntilNext = Math.max(0, Math.round(avgFrequencyDays - daysSinceLast));
      const predictedDate = new Date(Date.now() + daysUntilNext * 86400000);

      // Urgency
      let urgency: 'low' | 'medium' | 'high' | 'overdue' = 'low';
      if (daysUntilNext <= 0) urgency = 'overdue';
      else if (daysUntilNext <= 7) urgency = 'high';
      else if (daysUntilNext <= 30) urgency = 'medium';

      // Mileage-based prediction (every 10,000 km recommended)
      let mileageUntilNext = 10000;
      if (v.mileage) {
        const lastMaintMileage = completed.length > 0
          ? completed[0]?.id // use creation order
          : 0;
        // Estimate: if no tracked mileage at maintenance, use current
        const estMaintMileage = v.mileage - (avgTripDist * v.trips.length * 0.7);
        mileageUntilNext = Math.max(0, Math.round(10000 - (v.mileage - estMaintMileage)));
        if (mileageUntilNext < 500) urgency = 'high';
      }

      // Cost prediction (avg cost * seasonal factor)
      const monthFactor = 1 + 0.15 * Math.sin((new Date().getMonth() - 6) * Math.PI / 6); // Summer peak
      const predictedCost = Math.round(avgCost * monthFactor);

      // Maintenance type breakdown
      const typeBreakdown = (() => {
        const map = new Map<string, number>();
        records.forEach(r => {
          map.set(r.type, (map.get(r.type) || 0) + 1);
        });
        return Array.from(map.entries()).map(([type, count]) => ({ type, count }));
      })();

      return {
        id: v.id,
        plateNumber: v.plateNumber,
        make: v.make,
        model: v.model,
        vehicleType: v.vehicleType,
        mileage: v.mileage,
        status: v.status,
        urgency,
        daysUntilNextMaintenance: daysUntilNext,
        predictedNextDate: predictedDate.toISOString(),
        mileageUntilNextService: mileageUntilNext,
        predictedCost,
        avgMaintenanceCost: Math.round(avgCost),
        totalMaintenanceCost: totalCost,
        maintenanceCount: completed.length,
        avgFrequencyDays: Math.round(avgFrequencyDays),
        recentDistance: Math.round(recentDistance),
        typeBreakdown,
      };
    });

    // Sort by urgency (overdue first, then high, medium, low)
    const urgencyOrder = { overdue: 0, high: 1, medium: 2, low: 3 };
    predictions.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    // 4. Aggregate predictions
    const totalPredictedCost = predictions.reduce((s, p) => s + p.predictedCost, 0);
    const overdueCount = predictions.filter(p => p.urgency === 'overdue').length;
    const highUrgencyCount = predictions.filter(p => p.urgency === 'high').length;
    const avgDaysUntilService = predictions.length > 0
      ? Math.round(predictions.reduce((s, p) => s + p.daysUntilNextMaintenance, 0) / predictions.length)
      : 0;

    // 5. Cost trend (monthly maintenance cost)
    const now = new Date();
    const costTrend: { month: string; cost: number; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthName = mStart.toLocaleString('en', { month: 'short', year: '2-digit' });
      const records = await db.maintenanceRecord.findMany({
        where: {
          ...orgFilter,
          status: 'completed',
          completedDate: { gte: mStart, lt: mEnd },
        },
      });
      costTrend.push({
        month: monthName,
        cost: records.reduce((s, r) => s + (r.cost || 0), 0),
        count: records.length,
      });
    }

    // 6. Type distribution
    const allTypes = await db.maintenanceRecord.groupBy({
      by: ['type'],
      where: orgFilter,
      _count: true,
    });

    return NextResponse.json({
      summary: {
        totalVehicles: predictions.length,
        overdueCount,
        highUrgencyCount,
        totalPredictedCost,
        avgDaysUntilService,
        avgMaintenanceCost: predictions.length > 0
          ? Math.round(predictions.reduce((s, p) => s + p.avgMaintenanceCost, 0) / predictions.length)
          : 0,
      },
      predictions,
      costTrend,
      typeDistribution: allTypes.map(t => ({ type: t.type, count: t._count })),
    });
  } catch (err) {
    console.error('Maintenance prediction error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
