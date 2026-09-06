/**
 * P1 — REAL TELEMETRY E2E (behavioral)
 *
 * REAL handler/lib invocation against a Prisma spy boundary:
 *   device auth → validation → tenant enforcement → database →
 *   latest position (cache) → realtime SSE state → retention.
 * Assertions prove NO simulated positions exist anywhere in the pipeline.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHash } from 'crypto';

// ── Prisma spy boundary ───────────────────────────────────────
const deviceRows: Record<string, Record<string, unknown>> = {};
const vehicleRows: Record<string, Record<string, unknown>> = {};
const tripRows: Record<string, Record<string, unknown>> = {};
let telemetryRows: Record<string, unknown>[] = [];
const deviceUpdates: Record<string, unknown>[] = [];
const tripUpdates: Record<string, unknown>[] = [];

const DEVICE_KEY_RAW = 'dtk_test_raw_key_abcdef';
const DEVICE_KEY_HASH = createHash('sha256').update(DEVICE_KEY_RAW, 'utf8').digest('hex');

function seedDevice(id: string, overrides: Record<string, unknown> = {}) {
  deviceRows[id] = {
    id,
    imei: `imei-${id}`,
    deviceKeyHash: DEVICE_KEY_HASH,
    organizationId: 'org-A',
    status: 'installed',
    lastLat: null,
    lastLng: null,
    lastSpeed: null,
    lastHeading: null,
    lastDeviceTime: null,
    ...overrides,
  };
  return deviceRows[id];
}

vi.mock('@/lib/db', () => ({
  db: {
    device: {
      findUnique: vi.fn(async ({ where }: { where: { imei: string } }) => {
        for (const d of Object.values(deviceRows)) if (d.imei === where.imei) return { ...d };
        return null;
      }),
      update: vi.fn(async ({ where, data }) => {
        deviceUpdates.push({ where, data });
        deviceRows[where.id] = { ...deviceRows[where.id], ...data };
        return { ...deviceRows[where.id] };
      }),
    },
    vehicle: {
      findFirst: vi.fn(async ({ where }) => {
        for (const v of Object.values(vehicleRows)) {
          if (v.deviceId === where.deviceId && v.organizationId === where.organizationId) return { ...v };
        }
        return null;
      }),
      findMany: vi.fn(async ({ where }: { where: { organizationId?: unknown; status?: string } }) => {
        const org = where.organizationId;
        const orgMatch = typeof org === 'string' ? org : (org as { equals?: string })?.equals;
        return Object.values(vehicleRows)
          .filter((v) => v.organizationId === orgMatch && v.status === (where.status ?? v.status))
          .map((v) => ({
            id: v.id,
            plateNumber: v.plateNumber,
            make: null,
            model: null,
            driver: null,
            device: v.deviceId ? {
              id: v.deviceId,
              lastLat: deviceRows[v.deviceId as string]?.lastLat ?? null,
              lastLng: deviceRows[v.deviceId as string]?.lastLng ?? null,
              lastSpeed: deviceRows[v.deviceId as string]?.lastSpeed ?? null,
              lastHeading: deviceRows[v.deviceId as string]?.lastHeading ?? null,
              lastDeviceTime: deviceRows[v.deviceId as string]?.lastDeviceTime ?? null,
            } : null,
          }));
      }),
    },
    trip: {
      findFirst: vi.fn(async ({ where }) => {
        for (const t of Object.values(tripRows)) {
          if (t.vehicleId === where.vehicleId && t.status === where.status) return { ...t };
        }
        return null;
      }),
      update: vi.fn(async ({ where, data }) => {
        tripUpdates.push({ where, data });
        tripRows[where.id] = { ...tripRows[where.id], ...data };
        return { ...tripRows[where.id] };
      }),
    },
    telemetryEvent: {
      create: vi.fn(async ({ data }) => {
        // emulate the (deviceId, deviceTime) unique constraint
        const dupe = telemetryRows.some(
          (r) => r.deviceId === data.deviceId &&
                 (r.deviceTime as Date).getTime() === (data.deviceTime as Date).getTime()
        );
        if (dupe) {
          throw new Error('Unique constraint failed on the fields: (`device_id`,`device_time`) (P2002)');
        }
        telemetryRows.push({ ...data });
        return { ...data };
      }),
      deleteMany: vi.fn(async ({ where }) => {
        const cutoff = where.deviceTime.lt as Date;
        const before = telemetryRows.length;
        telemetryRows = telemetryRows.filter((r) => (r.deviceTime as Date).getTime() >= cutoff.getTime());
        return { count: before - telemetryRows.length };
      }),
    },
  },
}));

vi.mock('@/lib/rate-limit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rate-limit')>();
  return { ...actual };
});

function ingestRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/api/telemetry', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

import { POST as telemetryPost } from '@/app/api/telemetry/route';
import { GET as sseGet } from '@/app/api/realtime/vehicles/route';
import { validateTelemetry, haversineKm } from '@/lib/telemetry';

// Session persona injection for the SSE route
let persona: { id: string; role: string; organizationId: string | null } | null = null;
vi.mock('@/lib/auth', () => ({
  requireAuth: vi.fn(async () => {
    if (!persona) {
      return { user: null, error: Response.json({ error: 'Unauthorized' }, { status: 401 }) };
    }
    return { user: persona, error: null };
  }),
}));

beforeEach(() => {
  for (const k of Object.keys(deviceRows)) delete deviceRows[k];
  for (const k of Object.keys(vehicleRows)) delete vehicleRows[k];
  for (const k of Object.keys(tripRows)) delete tripRows[k];
  telemetryRows = [];
  deviceUpdates.length = 0;
  tripUpdates.length = 0;
  persona = null;
});

const authHeaders = { 'x-device-imei': 'imei-dev-A', 'x-device-key': DEVICE_KEY_RAW };

describe('P1 telemetry ingestion — device authentication', () => {
  beforeEach(() => seedDevice('dev-A'));

  it('valid device credentials → event accepted and stored with org binding', async () => {
    const res = await telemetryPost(ingestRequest(
      { lat: 25.2, lng: 55.27, speed: 42, heading: 180, deviceTime: new Date().toISOString() },
      authHeaders
    ));
    expect(res.status).toBe(200);
    expect(telemetryRows).toHaveLength(1);
    expect(telemetryRows[0].organizationId).toBe('org-A'); // hard-bound to device org
  });

  it('missing credentials → 401', async () => {
    const res = await telemetryPost(ingestRequest({ lat: 25.2, lng: 55.27, deviceTime: new Date().toISOString() }));
    expect(res.status).toBe(401);
  });

  it('unknown IMEI → 401 generic', async () => {
    const res = await telemetryPost(ingestRequest(
      { lat: 25.2, lng: 55.27, deviceTime: new Date().toISOString() },
      { 'x-device-imei': 'imei-unknown', 'x-device-key': DEVICE_KEY_RAW }
    ));
    expect(res.status).toBe(401);
  });

  it('wrong key → 401 generic (no oracle between unknown/mismatched)', async () => {
    const res = await telemetryPost(ingestRequest(
      { lat: 25.2, lng: 55.27, deviceTime: new Date().toISOString() },
      { 'x-device-imei': 'imei-dev-A', 'x-device-key': 'dtk_wrong_key' }
    ));
    expect(res.status).toBe(401);
  });

  it('orgless (warehouse) device → 403 fail-closed', async () => {
    seedDevice('dev-wh', { organizationId: null, status: 'warehouse' });
    const res = await telemetryPost(ingestRequest(
      { lat: 25.2, lng: 55.27, deviceTime: new Date().toISOString() },
      { 'x-device-imei': 'imei-dev-wh', 'x-device-key': DEVICE_KEY_RAW }
    ));
    expect(res.status).toBe(403);
    expect(telemetryRows).toHaveLength(0);
  });
});

describe('P1 telemetry ingestion — validation & anti-spoofing', () => {
  beforeEach(() => seedDevice('dev-A'));

  it.each([
    [{ lat: 91, lng: 55, deviceTime: new Date().toISOString() }, 'lat range'],
    [{ lat: 25, lng: 200, deviceTime: new Date().toISOString() }, 'lng range'],
    [{ lat: 25, lng: 55, speed: 9999, deviceTime: new Date().toISOString() }, 'speed bound'],
    [{ lat: 25, lng: 55, deviceTime: new Date(Date.now() + 30 * 60 * 1000).toISOString() }, 'future clock'],
    [{ lat: 25, lng: 55, deviceTime: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString() }, 'stale replay'],
  ])('rejects %s (400)', async (body, _label) => {
    const res = await telemetryPost(ingestRequest(body, authHeaders));
    expect(res.status).toBe(400);
    expect(telemetryRows).toHaveLength(0);
  });

  it('impossible implied speed vs previous fix → 422 spoof rejection', async () => {
    // First fix in Dubai
    await telemetryPost(ingestRequest(
      { lat: 25.2, lng: 55.27, speed: 60, deviceTime: new Date(Date.now() - 60_000).toISOString() },
      authHeaders
    ));
    expect(telemetryRows).toHaveLength(1);
    // 60s later: position ~500km away → implied ~30,000 km/h
    const res = await telemetryPost(ingestRequest(
      { lat: 24.0, lng: 60.0, speed: 60, deviceTime: new Date().toISOString() },
      authHeaders
    ));
    expect(res.status).toBe(422);
    expect(telemetryRows).toHaveLength(1); // rejected, not stored
  });

  it('duplicate submission (same deviceTime) is idempotent — single row stored', async () => {
    const t = new Date().toISOString();
    const r1 = await telemetryPost(ingestRequest({ lat: 25.2, lng: 55.27, deviceTime: t }, authHeaders));
    const r2 = await telemetryPost(ingestRequest({ lat: 25.2, lng: 55.27, deviceTime: t }, authHeaders));
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const body2 = await r2.json();
    expect(body2.duplicated).toBe(true);
    expect(telemetryRows).toHaveLength(1); // replay did not duplicate
  });

  it('out-of-order events accepted (older fix after newer, distinct timestamps)', async () => {
    const now = Date.now();
    await telemetryPost(ingestRequest({ lat: 25.2, lng: 55.27, deviceTime: new Date(now).toISOString() }, authHeaders));
    const res = await telemetryPost(ingestRequest({ lat: 25.21, lng: 55.28, deviceTime: new Date(now - 60_000).toISOString() }, authHeaders));
    expect(res.status).toBe(200);
    expect(telemetryRows).toHaveLength(2);
  });
});

describe('P1 telemetry — latest position cache + trip aggregation (server-authoritative)', () => {
  beforeEach(() => seedDevice('dev-A'));

  it('device cache updated with the accepted fix (latest position source)', async () => {
    await telemetryPost(ingestRequest(
      { lat: 25.2, lng: 55.27, speed: 30, heading: 90, deviceTime: new Date().toISOString() },
      authHeaders
    ));
    expect(deviceRows['dev-A'].lastLat).toBe(25.2);
    expect(deviceRows['dev-A'].lastLng).toBe(55.27);
    expect(deviceRows['dev-A'].lastSpeed).toBe(30);
    expect(deviceRows['dev-A'].lastDeviceTime).toBeInstanceOf(Date);
  });

  it('in-progress trip aggregates maxSpeed/distance server-side', async () => {
    vehicleRows['veh-A'] = { id: 'veh-A', plateNumber: 'A-1234', organizationId: 'org-A', status: 'active', deviceId: 'dev-A' };
    tripRows['trip-A'] = {
      id: 'trip-A', vehicleId: 'veh-A', status: 'in_progress',
      distance: 0, maxSpeed: 0, startTime: new Date(Date.now() - 600_000),
    };
    await telemetryPost(ingestRequest(
      { lat: 25.2, lng: 55.27, speed: 88, deviceTime: new Date(Date.now() - 60_000).toISOString() },
      authHeaders
    ));
    // ~1.4km in 60s ≈ 84 km/h implied — physically plausible
    await telemetryPost(ingestRequest(
      { lat: 25.21, lng: 55.28, speed: 95, deviceTime: new Date().toISOString() },
      authHeaders
    ));
    expect(tripUpdates.length).toBeGreaterThan(0);
    const last = tripUpdates[tripUpdates.length - 1].data as Record<string, unknown>;
    expect(last.maxSpeed).toBe(95);
    expect((last.distance as number)).toBeGreaterThan(0); // haversine segment, server-computed
    expect(last.avgSpeed).toBeDefined();
  });
});

describe('P1 telemetry — realtime SSE (real data, tenant-scoped, zero simulation)', () => {
  it('init: vehicles WITHOUT fresh telemetry report no_data with null coordinates', async () => {
    seedDevice('dev-A'); // no fixes yet
    vehicleRows['veh-A'] = { id: 'veh-A', plateNumber: 'A-1234', organizationId: 'org-A', status: 'active', deviceId: 'dev-A' };
    persona = { id: 'u1', role: 'org_owner', organizationId: 'org-A' };

    const res = await sseGet(new Request('http://localhost:3000/api/realtime/vehicles'));
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    reader.cancel();

    expect(text).toContain('"type":"init"');
    const payload = JSON.parse(text.replace(/^data: /, '').trim());
    expect(payload.vehicles[0].status).toBe('no_data');
    expect(payload.vehicles[0].lat).toBeNull();
    expect(payload.vehicles[0].lng).toBeNull();
  });

  it('init: fresh telemetry streams the REAL stored position', async () => {
    const d = seedDevice('dev-A');
    d.lastLat = 25.2; d.lastLng = 55.27; d.lastSpeed = 60; d.lastHeading = 180;
    d.lastDeviceTime = new Date(Date.now() - 30_000);
    vehicleRows['veh-A'] = { id: 'veh-A', plateNumber: 'A-1234', organizationId: 'org-A', status: 'active', deviceId: 'dev-A' };
    persona = { id: 'u1', role: 'org_owner', organizationId: 'org-A' };

    const res = await sseGet(new Request('http://localhost:3000/api/realtime/vehicles'));
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    reader.cancel();

    const payload = JSON.parse(text.replace(/^data: /, '').trim());
    expect(payload.vehicles[0].lat).toBe(25.2);
    expect(payload.vehicles[0].lng).toBe(55.27);
    expect(payload.vehicles[0].speed).toBe(60);
    expect(payload.vehicles[0].status).toBe('moving');
  });

  it('tenant scoping: org B user never receives org A vehicle positions', async () => {
    seedDevice('dev-A');
    vehicleRows['veh-A'] = { id: 'veh-A', plateNumber: 'A-1234', organizationId: 'org-A', status: 'active', deviceId: 'dev-A' };
    persona = { id: 'u2', role: 'org_owner', organizationId: 'org-B' };

    const res = await sseGet(new Request('http://localhost:3000/api/realtime/vehicles'));
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    reader.cancel();

    const payload = JSON.parse(text.replace(/^data: /, '').trim());
    expect(payload.vehicles).toHaveLength(0); // org B sees nothing from org A
  });

  it('stale telemetry (>15min) is honestly reported as no_data, not kept as live', async () => {
    const d = seedDevice('dev-A');
    d.lastLat = 25.2; d.lastLng = 55.27; d.lastSpeed = 60;
    d.lastDeviceTime = new Date(Date.now() - 16 * 60 * 1000); // stale
    vehicleRows['veh-A'] = { id: 'veh-A', plateNumber: 'A-1234', organizationId: 'org-A', status: 'active', deviceId: 'dev-A' };
    persona = { id: 'u1', role: 'org_owner', organizationId: 'org-A' };

    const res = await sseGet(new Request('http://localhost:3000/api/realtime/vehicles'));
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    reader.cancel();

    const payload = JSON.parse(text.replace(/^data: /, '').trim());
    expect(payload.vehicles[0].status).toBe('no_data');
    expect(payload.vehicles[0].lat).toBeNull();
  });

  it('SSE route source contains NO position generation (structural guard)', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '..', 'src/app/api/realtime/vehicles/route.ts'), 'utf8'
    );
    expect(src).not.toMatch(/Math\.random/);
    expect(src).not.toMatch(/UAE_LOCATIONS/);
    expect(src).not.toMatch(/latDelta|lngDelta/);
  });
});

describe('P1 telemetry — retention', () => {
  it('cleanup_old_telemetry deletes events older than the retention window', async () => {
    const now = Date.now();
    telemetryRows = [
      { deviceId: 'd1', deviceTime: new Date(now - 100 * 24 * 3600 * 1000) },
      { deviceId: 'd1', deviceTime: new Date(now - 1 * 24 * 3600 * 1000) },
    ];
    const { handleMaintenanceJob } = await import('@/lib/handlers/maintenance-handler');
    const result = await handleMaintenanceJob({
      id: 'job-1', type: 'maintenance', organizationId: null, requestId: 'r1', attempt: 1,
      payload: { task: 'cleanup_old_telemetry' },
    } as never);
    expect((result as { cleaned: number }).cleaned).toBe(1);
    expect(telemetryRows).toHaveLength(1); // recent event retained
  });
});

describe('P1 telemetry — validation helpers (unit)', () => {
  it('haversineKm: Dubai→Abu Dhabi ≈ 130km', () => {
    const km = haversineKm(25.2048, 55.2708, 24.4539, 54.3773);
    expect(km).toBeGreaterThan(110);
    expect(km).toBeLessThan(150);
  });

  it('validateTelemetry accepts numbers-as-strings but rejects junk', () => {
    expect(validateTelemetry({ lat: '25.2', lng: '55.3', deviceTime: new Date().toISOString() }).ok).toBe(true);
    expect(validateTelemetry({ lat: 'abc', lng: 55, deviceTime: new Date() }).ok).toBe(false);
    expect(validateTelemetry({ lat: 25, lng: 55 }).ok).toBe(false); // missing time
  });
});
