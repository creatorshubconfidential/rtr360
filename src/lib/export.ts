/**
 * RTR 360 — CSV Export Utility
 * Provides exportCSV() for downloading table data as CSV files.
 * All currency values formatted in AED.
 */

export function exportCSV<T extends Record<string, any>>({
  data,
  filename,
  columns,
}: {
  data: T[];
  filename: string;
  columns: { key: string; label: string; format?: (val: any, row: T) => string }[];
}) {
  if (data.length === 0) return;

  // Build CSV content
  const headers = columns.map(c => `"${c.label}"`).join(',');
  const rows = data.map(row =>
    columns.map(col => {
      const raw = col.key.split('.').reduce((o, k) => o?.[k], row);
      const val = col.format ? col.format(raw, row) : (raw ?? '');
      // Escape quotes and wrap in quotes
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    }).join(',')
  );

  const csv = [headers, ...rows].join('\n');

  // Create blob and trigger download
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ────────────────────────────────────────
// Preset Column Configs for Each View
// ────────────────────────────────────────

export const VEHICLE_COLUMNS = [
  { key: 'internalId', label: 'Internal ID' },
  { key: 'plateNumber', label: 'Plate Number' },
  { key: 'make', label: 'Make' },
  { key: 'model', label: 'Model' },
  { key: 'year', label: 'Year' },
  { key: 'vehicleType', label: 'Type' },
  { key: 'status', label: 'Status' },
  { key: 'mileage', label: 'Mileage', format: (v: number) => v?.toLocaleString() || '' },
  { key: 'driver.name', label: 'Driver' },
  { key: 'createdAt', label: 'Created', format: (v: string) => new Date(v).toLocaleDateString('en-AE') },
];

export const DRIVER_COLUMNS = [
  { key: 'employeeId', label: 'Employee ID' },
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'licenseType', label: 'License Type' },
  { key: 'licenseExpiry', label: 'License Expiry', format: (v: string) => v ? new Date(v).toLocaleDateString('en-AE') : '' },
  { key: 'emirate', label: 'Emirate' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'score', label: 'Score' },
  { key: 'totalTrips', label: 'Total Trips' },
  { key: 'status', label: 'Status' },
];

export const LEAD_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'company', label: 'Company' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'emirate', label: 'Emirate' },
  { key: 'vehicleCount', label: 'Vehicles' },
  { key: 'vehicleType', label: 'Vehicle Type' },
  { key: 'source', label: 'Source' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'createdAt', label: 'Created', format: (v: string) => new Date(v).toLocaleDateString('en-AE') },
];

export const DEVICE_COLUMNS = [
  { key: 'imei', label: 'IMEI' },
  { key: 'serialNumber', label: 'Serial Number' },
  { key: 'model', label: 'Model' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'deviceType', label: 'Type' },
  { key: 'status', label: 'Status' },
  { key: 'phoneNumber', label: 'Phone Number' },
  { key: 'purchaseCost', label: 'Cost (AED)', format: (v: number) => v ? `AED ${v.toLocaleString()}` : '' },
  { key: 'warehouse', label: 'Warehouse' },
];

export const MAINTENANCE_COLUMNS = [
  { key: 'vehicle.plateNumber', label: 'Vehicle' },
  { key: 'type', label: 'Type' },
  { key: 'description', label: 'Description' },
  { key: 'triggerType', label: 'Trigger' },
  { key: 'scheduledDate', label: 'Scheduled', format: (v: string) => v ? new Date(v).toLocaleDateString('en-AE') : '' },
  { key: 'completedDate', label: 'Completed', format: (v: string) => v ? new Date(v).toLocaleDateString('en-AE') : '' },
  { key: 'cost', label: 'Cost (AED)', format: (v: number) => v ? `AED ${v.toLocaleString()}` : '' },
  { key: 'status', label: 'Status' },
];

export const TICKET_COLUMNS = [
  { key: 'ticketNumber', label: 'Ticket #', format: (v: string) => v || '' },
  { key: 'subject', label: 'Subject' },
  { key: 'priority', label: 'Priority' },
  { key: 'status', label: 'Status' },
  { key: 'vehiclePlate', label: 'Vehicle Plate' },
  { key: 'createdAt', label: 'Created', format: (v: string) => new Date(v).toLocaleDateString('en-AE') },
];

export const INVOICE_COLUMNS = [
  { key: 'invoiceNumber', label: 'Invoice #' },
  { key: 'amount', label: 'Amount (AED)', format: (v: number) => `AED ${v?.toLocaleString() || '0'}` },
  { key: 'tax', label: 'VAT (AED)', format: (v: number) => `AED ${v?.toLocaleString() || '0'}` },
  { key: 'total', label: 'Total (AED)', format: (v: number) => `AED ${v?.toLocaleString() || '0'}` },
  { key: 'status', label: 'Status' },
  { key: 'dueDate', label: 'Due Date', format: (v: string) => new Date(v).toLocaleDateString('en-AE') },
  { key: 'paidAt', label: 'Paid At', format: (v: string) => v ? new Date(v).toLocaleDateString('en-AE') : '' },
];

export const INSTALLATION_COLUMNS = [
  { key: 'installationNumber', label: 'Installation #' },
  { key: 'vehicle.plateNumber', label: 'Vehicle' },
  { key: 'device.imei', label: 'Device IMEI' },
  { key: 'technician.name', label: 'Technician' },
  { key: 'status', label: 'Status' },
  { key: 'scheduledDate', label: 'Scheduled', format: (v: string) => v ? new Date(v).toLocaleDateString('en-AE') : '' },
  { key: 'emirate', label: 'Emirate' },
  { key: 'location', label: 'Location' },
];
