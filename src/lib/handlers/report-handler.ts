/**
 * RTR 360 — Report Job Handler
 *
 * Generates and exports reports for an organization.
 * Supports the actual report types used by RTR360:
 *   - fleet_overview: Vehicle fleet summary
 *   - driver_performance: Driver scores and trips
 *   - revenue: Invoice revenue report
 *   - maintenance: Maintenance cost report
 *   - trips: Trip distance/duration report
 *
 * Output formats: csv, xlsx (csv for now, xlsx requires dependency).
 * PDF generation is documented as an infrastructure blocker (pdfkit issue).
 *
 * All queries are tenant-scoped via organizationId from the job.
 * No cross-tenant data access possible.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import type { ClaimedJob } from '@/lib/queue';
import { ValidationError } from '@/lib/errors';

// ── Report Types (static allowlist) ─────────────────────────────

const ALLOWED_REPORT_TYPES = new Set([
  'fleet_overview',
  'driver_performance',
  'revenue',
  'maintenance',
  'trips',
]) as ReadonlySet<string>;

const ALLOWED_FORMATS = new Set(['csv', 'xlsx']) as ReadonlySet<string>;

// ── Types ────────────────────────────────────────────────────────

interface ReportResult {
  reportType: string;
  format: string;
  rowCount: number;
  generatedAt: string;
 /** Base64-encoded file content for small reports */
  content?: string;
  /** Status: 'generated', 'pdf_blocked', 'partial' */
  status: string;
  message?: string;
}

// ── Report Generators ────────────────────────────────────────────

interface ReportRow {
 [key: string]: string | number | boolean | null;
}

function csvEscape(value: string | number | boolean | null): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows: ReportRow[], columns: string[]): string {
  const header = columns.map(csvEscape).join(',');
  const dataRows = rows.map(row =>
    columns.map(col => csvEscape(row[col])).join(',')
  );
  return [header, ...dataRows].join('\n');
}

async function generateFleetOverview(orgId: string): Promise<{ rows: ReportRow[]; columns: string[] }> {
  const vehicles = await db.vehicle.findMany({
    where: { organizationId: orgId },
    select: {
      internalId: true, plateNumber: true, make: true, model: true,
      year: true, vehicleType: true, status: true, mileage: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10000, // bounded
  });

  const columns = ['Internal ID', 'Plate Number', 'Make', 'Model', 'Year', 'Type', 'Status', 'Mileage'];
  const rows: ReportRow[] = vehicles.map(v => ({
    'Internal ID': v.internalId ?? '',
    'Plate Number': v.plateNumber,
    'Make': v.make ?? '',
    'Model': v.model ?? '',
    'Year': v.year ?? '',
    'Type': v.vehicleType ?? '',
    'Status': v.status,
    'Mileage': v.mileage ?? 0,
  }));

  return { rows, columns };
}

async function generateDriverPerformance(orgId: string): Promise<{ rows: ReportRow[]; columns: string[] }> {
  const drivers = await db.driver.findMany({
    where: { organizationId: orgId },
    select: {
      employeeId: true, name: true, phone: true,
      licenseType: true, status: true,
      score: true, totalTrips: true, totalDistance: true, totalViolations: true,
    },
    orderBy: { score: 'desc' },
    take: 10000,
  });

  const columns = ['Employee ID', 'Name', 'Phone', 'License Type', 'Status', 'Score', 'Total Trips', 'Total Distance (km)', 'Violations'];
  const rows: ReportRow[] = drivers.map(d => ({
    'Employee ID': d.employeeId ?? '',
    'Name': d.name,
    'Phone': d.phone ?? '',
    'License Type': d.licenseType ?? '',
    'Status': d.status,
    'Score': d.score ?? 0,
    'Total Trips': d.totalTrips ?? 0,
    'Total Distance (km)': d.totalDistance ?? 0,
    'Violations': d.totalViolations ?? 0,
  }));

  return { rows, columns };
}

async function generateRevenueReport(
  orgId: string,
  filters: Record<string, unknown> | undefined,
): Promise<{ rows: ReportRow[]; columns: string[] }> {
  const startDate = filters?.startDate ? new Date(String(filters.startDate)) : new Date(new Date().getFullYear(), new Date().getMonth() - 6, 1);
  const endDate = filters?.endDate ? new Date(String(filters.endDate)) : new Date();

  const invoices = await db.invoice.findMany({
    where: {
      organizationId: orgId,
      createdAt: { gte: startDate, lte: endDate },
    },
    select: {
      invoiceNumber: true, status: true, amount: true,
      tax: true, total: true, dueDate: true, paidAt: true, createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10000,
  });

  const columns = ['Invoice #', 'Status', 'Subtotal (AED)', 'Tax (AED)', 'Total (AED)', 'Due Date', 'Paid At', 'Created At'];
  const rows: ReportRow[] = invoices.map(inv => ({
    'Invoice #': inv.invoiceNumber,
    'Status': inv.status,
    'Subtotal (AED)': Number(inv.amount),
    'Tax (AED)': Number(inv.tax),
    'Total (AED)': Number(inv.total),
    'Due Date': inv.dueDate.toISOString().slice(0, 10),
    'Paid At': inv.paidAt ? inv.paidAt.toISOString().slice(0, 10) : '',
    'Created At': inv.createdAt.toISOString().slice(0, 10),
  }));

  return { rows, columns };
}

async function generateMaintenanceReport(
  orgId: string,
  filters: Record<string, unknown> | undefined,
): Promise<{ rows: ReportRow[]; columns: string[] }> {
  const startDate = filters?.startDate ? new Date(String(filters.startDate)) : new Date(new Date().getFullYear(), new Date().getMonth() - 6, 1);

  const records = await db.maintenanceRecord.findMany({
    where: {
      organizationId: orgId,
      createdAt: { gte: startDate },
    },
    select: {
      id: true, type: true, status: true, cost: true,
      scheduledDate: true, completedDate: true,
      vehicle: { select: { plateNumber: true, make: true, model: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10000,
  });

  const columns = ['ID', 'Vehicle', 'Type', 'Status', 'Cost (AED)', 'Scheduled Date', 'Completed Date'];
  const rows: ReportRow[] = records.map(r => ({
    'ID': r.id.slice(-8),
    'Vehicle': `${r.vehicle.plateNumber} (${r.vehicle.make} ${r.vehicle.model})`,
    'Type': r.type,
    'Status': r.status,
    'Cost (AED)': Number(r.cost ?? 0),
    'Scheduled Date': r.scheduledDate ? r.scheduledDate.toISOString().slice(0, 10) : '',
    'Completed Date': r.completedDate ? r.completedDate.toISOString().slice(0, 10) : '',
  }));

  return { rows, columns };
}

async function generateTripsReport(
  orgId: string,
  filters: Record<string, unknown> | undefined,
): Promise<{ rows: ReportRow[]; columns: string[] }> {
  const startDate = filters?.startDate ? new Date(String(filters.startDate)) : new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);

  const trips = await db.trip.findMany({
    where: {
      organizationId: orgId,
      startTime: { gte: startDate },
    },
    select: {
      id: true, status: true, distance: true, duration: true,
      startTime: true, endTime: true, vehicleId: true, driverName: true,
    },
    orderBy: { startTime: 'desc' },
    take: 10000,
  });

  const columns = ['ID', 'Vehicle ID', 'Driver', 'Status', 'Distance (km)', 'Duration (min)', 'Start Time', 'End Time'];
  const rows: ReportRow[] = trips.map(t => ({
    'ID': t.id.slice(-8),
    'Vehicle ID': t.vehicleId ?? '',
    'Driver': t.driverName ?? '',
    'Status': t.status,
    'Distance (km)': t.distance ?? 0,
    'Duration (min)': t.duration ?? 0,
    'Start Time': t.startTime ? t.startTime.toISOString() : '',
    'End Time': t.endTime ? t.endTime.toISOString() : '',
  }));

  return { rows, columns };
}

// ── Report Generator Map ────────────────────────────────────────

const REPORT_GENERATORS: Record<string, (orgId: string, filters?: Record<string, unknown>) => Promise<{ rows: ReportRow[]; columns: string[] }>> = {
  fleet_overview: generateFleetOverview,
  driver_performance: generateDriverPerformance,
  revenue: generateRevenueReport,
  maintenance: generateMaintenanceReport,
  trips: generateTripsReport,
};

// ── Handler ──────────────────────────────────────────────────────

const REPORT_TIMEOUT_MS = 120_000; // 2 minutes for large reports

/**
 * Report job handler.
 * Generates a report for the organization, outputs as CSV.
 * PDF output is documented as blocked (pdfkit issue).
 */
export async function handleReportJob(job: ClaimedJob): Promise<ReportResult> {
  // Tenant boundary: report jobs MUST have an organizationId
  if (!job.organizationId) {
    throw new ValidationError('Report jobs require an organizationId', [
      { field: 'organizationId', message: 'Tenant-scoped job missing organizationId' },
    ]);
  }

  const payload = job.payload as Record<string, unknown>;
  const reportType = String(payload.reportType ?? '');
  const format = String(payload.format ?? 'csv');
  const filters = payload.filters as Record<string, unknown> | undefined;

  // Validate report type
  if (!reportType || !ALLOWED_REPORT_TYPES.has(reportType)) {
    throw new ValidationError(`Unknown or disallowed report type: '${reportType}'`, [
      { field: 'reportType', message: `Must be one of: ${Array.from(ALLOWED_REPORT_TYPES).join(', ')}` },
    ]);
  }

  // Validate format
  if (!ALLOWED_FORMATS.has(format)) {
    if (format === 'pdf') {
      // Document known blocker
      logger.warn('report.pdf_blocked', {
        jobId: job.id,
        reportType,
        organizationId: job.organizationId,
        reason: 'pdfkit_module_resolution_issue',
        requestId: job.requestId,
      });
      return {
        reportType,
        format: 'pdf',
        rowCount: 0,
        generatedAt: new Date().toISOString(),
        status: 'pdf_blocked',
        message: 'PDF generation is temporarily unavailable due to a known pdfkit module resolution issue. Use csv format instead.',
      };
    }
    throw new ValidationError(`Unsupported report format: '${format}'`, [
      { field: 'format', message: `Must be one of: ${Array.from(ALLOWED_FORMATS).join(', ')}` },
    ]);
  }

  const generator = REPORT_GENERATORS[reportType];
  if (!generator) {
    throw new Error(`Report generator not found for type: '${reportType}'`);
  }

  // Execute with timeout
  const startTime = Date.now();
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('[TRANSIENT] Report generation timed out')), REPORT_TIMEOUT_MS)
  );

  const result = await Promise.race([generator(job.organizationId, filters), timeoutPromise]);
  const durationMs = Date.now() - startTime;

  // Generate CSV content
  const csvContent = toCsv(result.rows, result.columns);
  const base64Content = Buffer.from(csvContent, 'utf-8').toString('base64');

  logger.info('report.generated', {
    jobId: job.id,
    reportType,
    format,
    rowCount: result.rows.length,
    durationMs,
    organizationId: job.organizationId,
    requestId: job.requestId,
  });

  return {
    reportType,
    format,
    rowCount: result.rows.length,
    generatedAt: new Date().toISOString(),
    content: base64Content,
    status: 'generated',
  };
}
