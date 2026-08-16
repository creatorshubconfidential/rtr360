import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(request: Request) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const orgFilter = user.role === 'super_admin' ? {} : { organizationId: user.organizationId! };

    // 1. Vehicle status breakdown
    const vehicles = await db.vehicle.findMany({
      where: orgFilter,
      include: {
        device: { select: { status: true, lastPingAt: true } },
        driver: { select: { name: true, score: true, licenseExpiry: true } },
        maintenanceRecords: {
          where: { status: { in: ['upcoming', 'scheduled', 'in_progress'] } },
          select: { type: true, scheduledDate: true, cost: true },
          orderBy: { scheduledDate: 'asc' },
        },
        _count: { select: { trips: true, maintenanceRecords: true, alerts: true } },
      },
    });

    // 2. Compute per-vehicle health score (0-100)
    const vehicleHealths = vehicles.map(v => {
      let score = 100;

      // Device offline penalty
      if (!v.device || v.device.status !== 'installed') score -= 25;
      else if (v.device.lastPingAt) {
        const hoursSincePing = (Date.now() - new Date(v.device.lastPingAt).getTime()) / 3600000;
        if (hoursSincePing > 48) score -= 20;
        else if (hoursSincePing > 24) score -= 10;
      }

      // Driver score factor
      if (v.driver) {
        score = Math.min(score, Math.round(score * 0.3 + v.driver.score * 0.7));
        // License expiring within 30 days
        if (v.driver.licenseExpiry) {
          const daysToExpiry = (new Date(v.driver.licenseExpiry).getTime() - Date.now()) / 86400000;
          if (daysToExpiry < 0) score -= 20;
          else if (daysToExpiry < 30) score -= 10;
          else if (daysToExpiry < 90) score -= 5;
        }
      } else {
        score -= 15; // No driver assigned
      }

      // Maintenance overdue penalty
      const upcomingMaint = v.maintenanceRecords || [];
      const overdue = upcomingMaint.filter(m => m.scheduledDate && new Date(m.scheduledDate) < new Date());
      if (overdue.length > 0) score -= overdue.length * 10;
      else if (upcomingMaint.length > 2) score -= 5;

      // Mileage-based penalty (high mileage vehicles)
      if (v.mileage && v.mileage > 200000) score -= 10;
      else if (v.mileage && v.mileage > 150000) score -= 5;

      score = Math.max(0, Math.min(100, score));
      const grade = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';
      const riskLevel = score >= 80 ? 'low' : score >= 60 ? 'medium' : score >= 40 ? 'high' : 'critical';

      return {
        id: v.id,
        plateNumber: v.plateNumber,
        make: v.make,
        model: v.model,
        vehicleType: v.vehicleType,
        status: v.status,
        mileage: v.mileage,
        score,
        grade,
        riskLevel,
        driver: v.driver ? { name: v.driver.name, score: v.driver.score, licenseExpiry: v.driver.licenseExpiry } : null,
        device: v.device ? { status: v.device.status, lastPing: v.device.lastPingAt } : null,
        upcomingMaintenance: upcomingMaint.length,
        totalTrips: v._count.trips,
        totalMaintenance: v._count.maintenanceRecords,
      };
    });

    // Sort by score ascending (worst first)
    vehicleHealths.sort((a, b) => a.score - b.score);

    // 3. Fleet-wide aggregates
    const totalVehicles = vehicleHealths.length;
    const avgScore = totalVehicles > 0 ? Math.round(vehicleHealths.reduce((s, v) => s + v.score, 0) / totalVehicles) : 0;
    const criticalCount = vehicleHealths.filter(v => v.riskLevel === 'critical').length;
    const highRiskCount = vehicleHealths.filter(v => v.riskLevel === 'high').length;
    const mediumRiskCount = vehicleHealths.filter(v => v.riskLevel === 'medium').length;
    const lowRiskCount = vehicleHealths.filter(v => v.riskLevel === 'low').length;

    const gradeDistribution = ['A', 'B', 'C', 'D'].map(g => ({
      grade: g,
      count: vehicleHealths.filter(v => v.grade === g).length,
    }));

    const typeAverages = (() => {
      const map = new Map<string, number[]>();
      vehicleHealths.forEach(v => {
        const t = v.vehicleType || 'Other';
        if (!map.has(t)) map.set(t, []);
        map.get(t)!.push(v.score);
      });
      return Array.from(map.entries()).map(([type, scores]) => ({
        type,
        avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        count: scores.length,
      })).sort((a, b) => a.avgScore - b.avgScore);
    })();

    // 4. Top issues
    const issues: { type: string; message: string; severity: string; vehiclePlate: string }[] = [];
    vehicleHealths.forEach(v => {
      if (!v.device) issues.push({ type: 'no_device', message: 'No GPS device installed', severity: 'high', vehiclePlate: v.plateNumber });
      if (!v.driver) issues.push({ type: 'no_driver', message: 'No driver assigned', severity: 'medium', vehiclePlate: v.plateNumber });
      if (v.upcomingMaintenance > 0) issues.push({ type: 'maintenance_due', message: `${v.upcomingMaintenance} maintenance(s) due`, severity: v.upcomingMaintenance > 2 ? 'high' : 'medium', vehiclePlate: v.plateNumber });
      if (v.driver?.licenseExpiry) {
        const days = (new Date(v.driver.licenseExpiry).getTime() - Date.now()) / 86400000;
        if (days < 0) issues.push({ type: 'license_expired', message: 'Driver license expired', severity: 'critical', vehiclePlate: v.plateNumber });
        else if (days < 30) issues.push({ type: 'license_expiring', message: `License expires in ${Math.ceil(days)} days`, severity: 'high', vehiclePlate: v.plateNumber });
      }
    });
    issues.sort((a, b) => {
      const sev = { critical: 0, high: 1, medium: 2, low: 3 };
      return (sev[a.severity as keyof typeof sev] || 3) - (sev[b.severity as keyof typeof sev] || 3);
    });

    return NextResponse.json({
      fleetScore: avgScore,
      fleetGrade: avgScore >= 80 ? 'A' : avgScore >= 60 ? 'B' : avgScore >= 40 ? 'C' : 'D',
      summary: { totalVehicles, criticalCount, highRiskCount, mediumRiskCount, lowRiskCount },
      vehicles: vehicleHealths,
      gradeDistribution,
      typeAverages,
      topIssues: issues.slice(0, 20),
    });
  } catch (err) {
    logger.error('Fleet health error', { err });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
