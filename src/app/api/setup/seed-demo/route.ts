import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword, requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { Prisma } from '@prisma/client';

/**
 * POST /api/setup/seed-demo
 *
 * 1) Syncs Prisma schema to database (fixes missing columns)
 * 2) Populates the database with comprehensive demo data
 * Idempotent — checks if demo data already exists before creating.
 * Call this AFTER the initial /api/setup/seed has been run.
 */
export async function POST(request: Request) {
  try {
    // Auth check — only admins and super_admins can seed demo data
    const { user, error: authError } = await requireAuth(request);
    if (authError) return authError;
    if (!['super_admin', 'org_owner', 'platform_admin'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Only administrators can seed demo data' },
        { status: 403 }
      );
    }

    // ========== 0. SCHEMA SYNC (fixes P2022 missing column errors) ==========
    let schemaSyncResult = 'skipped';

    // Add missing columns directly via SQL (safe for serverless/edge)
    try {
      const columnsToAdd: string[] = [];

        // Check each column and add if missing
        const checks: { col: string; tbl: string; def: string }[] = [
          // Trip table
          { tbl: 'Trip', col: 'driverName', def: 'TEXT' },
          { tbl: 'Trip', col: 'organization_id', def: 'TEXT' },
          { tbl: 'Trip', col: 'start_time', def: 'TIMESTAMPTZ' },
          { tbl: 'Trip', col: 'end_time', def: 'TIMESTAMPTZ' },
          { tbl: 'Trip', col: 'distance', def: 'DOUBLE PRECISION' },
          { tbl: 'Trip', col: 'duration', def: 'INTEGER' },
          { tbl: 'Trip', col: 'max_speed', def: 'DOUBLE PRECISION' },
          { tbl: 'Trip', col: 'avg_speed', def: 'DOUBLE PRECISION' },
          { tbl: 'Trip', col: 'idle_time', def: 'INTEGER' },
          { tbl: 'Trip', col: 'overspeed_count', def: 'INTEGER' },
          { tbl: 'Trip', col: 'harsh_brakes', def: 'INTEGER' },
          { tbl: 'Trip', col: 'harsh_accel', def: 'INTEGER' },
          { tbl: 'Trip', col: 'status', def: 'TEXT DEFAULT \'in_progress\'' },
          // Device table
          { tbl: 'Device', col: 'phoneNumber', def: 'TEXT' },
          { tbl: 'Device', col: 'serial_number', def: 'TEXT' },
          { tbl: 'Device', col: 'device_type', def: 'TEXT' },
          { tbl: 'Device', col: 'protocol', def: 'TEXT' },
          { tbl: 'Device', col: 'firmware', def: 'TEXT' },
          { tbl: 'Device', col: 'sim_id', def: 'TEXT' },
          { tbl: 'Device', col: 'warehouse', def: 'TEXT' },
          { tbl: 'Device', col: 'purchase_date', def: 'TIMESTAMPTZ' },
          { tbl: 'Device', col: 'purchase_cost', def: 'DECIMAL(10,2)' },
          { tbl: 'Device', col: 'install_date', def: 'TIMESTAMPTZ' },
          { tbl: 'Device', col: 'warranty_expiry', def: 'TIMESTAMPTZ' },
          { tbl: 'Device', col: 'last_ping_at', def: 'TIMESTAMPTZ' },
          { tbl: 'Device', col: 'battery_level', def: 'INTEGER' },
          // Vehicle table
          { tbl: 'Vehicle', col: 'internal_id', def: 'TEXT' },
          { tbl: 'Vehicle', col: 'vin', def: 'TEXT' },
          { tbl: 'Vehicle', col: 'color', def: 'TEXT' },
          { tbl: 'Vehicle', col: 'engine_hours', def: 'DOUBLE PRECISION' },
          { tbl: 'Vehicle', col: 'install_date', def: 'TIMESTAMPTZ' },
          { tbl: 'Vehicle', col: 'warranty_expiry', def: 'TIMESTAMPTZ' },
          // Notification table
          { tbl: 'Notification', col: 'user_id', def: 'TEXT' },
          { tbl: 'Notification', col: 'organization_id', def: 'TEXT' },
          { tbl: 'Notification', col: 'body', def: 'TEXT' },
          { tbl: 'Notification', col: 'read', def: 'BOOLEAN DEFAULT false' },
          { tbl: 'Notification', col: 'metadata', def: 'TEXT' },
          // MaintenanceRecord table
          { tbl: 'MaintenanceRecord', col: 'trigger_type', def: 'TEXT' },
          { tbl: 'MaintenanceRecord', col: 'trigger_value', def: 'DOUBLE PRECISION' },
          { tbl: 'MaintenanceRecord', col: 'completed_date', def: 'TIMESTAMPTZ' },
          // Installation table
          { tbl: 'Installation', col: 'installation_number', def: 'TEXT' },
          { tbl: 'Installation', col: 'scheduled_time', def: 'TEXT' },
          { tbl: 'Installation', col: 'latitude', def: 'DOUBLE PRECISION' },
          { tbl: 'Installation', col: 'longitude', def: 'DOUBLE PRECISION' },
          { tbl: 'Installation', col: 'photos', def: 'TEXT' },
          { tbl: 'Installation', col: 'test_result', def: 'TEXT' },
          { tbl: 'Installation', col: 'gps_signal', def: 'BOOLEAN' },
          { tbl: 'Installation', col: 'power_wiring', def: 'BOOLEAN' },
          { tbl: 'Installation', col: 'antenna_mounted', def: 'BOOLEAN' },
          { tbl: 'Installation', col: 'signature', def: 'TEXT' },
        ];

        for (const c of checks) {
          try {
            const exists = await db.$queryRawUnsafe(
              `SELECT column_name FROM information_schema.columns WHERE table_name = '${c.tbl.toLowerCase()}' AND column_name = '${c.col}'`
            );
            if (!Array.isArray(exists) || (exists as unknown[]).length === 0) {
              await db.$executeRawUnsafe(`ALTER TABLE "${c.tbl}" ADD COLUMN IF NOT EXISTS "${c.col}" ${c.def}`);
              columnsToAdd.push(`${c.tbl}.${c.col}`);
            }
          } catch {
            // Table might not exist — skip
          }
        }
        schemaSyncResult = `sql: added ${columnsToAdd.length} columns (${columnsToAdd.join(', ')})`;
        logger.info('Schema sync completed via SQL', { columnsAdded: columnsToAdd });
      } catch (sqlError: unknown) {
        const sqlMsg = sqlError instanceof Error ? sqlError.message : String(sqlError);
        logger.warn('Schema sync failed', { error: sqlMsg });
        schemaSyncResult = `failed: ${sqlMsg.slice(0, 200)}`;
      }

    // Find the existing organization
    const org = await db.organization.findFirst();
    if (!org) {
      return NextResponse.json({ error: 'No organization found. Run /api/setup/seed first.' }, { status: 400 });
    }

    // Schema sync already ran above. Check if fully seeded (settings are created last).
    const settingCount = await db.setting.count();
    if (settingCount >= 10) {
      return NextResponse.json({
        message: 'Demo data already fully seeded. Schema sync was run. Use ?force=true to re-seed.',
        seeded: false,
        schemaSync: schemaSyncResult,
      });
    }

    logger.info('Seeding demo data for organization', { orgId: org.id, orgName: org.name });
    const results: Record<string, unknown> = {};

    // ========== 1. ADDITIONAL USERS ==========
    const users = await db.user.findMany({ where: { organizationId: org.id } });
    const adminUser = users.find(u => u.role === 'admin') || users[0];

    let fleetManager = users.find(u => u.role === 'manager');
    if (!fleetManager) {
      fleetManager = await db.user.create({
        data: {
          email: 'manager@rtr.ae',
          passwordHash: await hashPassword('manager123'),
          name: 'Ahmed Al Maktoum',
          phone: '+971502234567',
          role: 'manager',
          organizationId: org.id,
          status: 'active',
          emailVerified: true,
        },
      });
    }
    results.users = await db.user.count({ where: { organizationId: org.id } });

    let opsUser = users.find(u => u.role === 'operator');
    if (!opsUser) {
      opsUser = await db.user.create({
        data: {
          email: 'ops@rtr.ae',
          passwordHash: await hashPassword('ops123'),
          name: 'Fatima Hassan',
          phone: '+971503345678',
          role: 'operator',
          organizationId: org.id,
          status: 'active',
          emailVerified: true,
        },
      });
    }
    results.users = await db.user.count({ where: { organizationId: org.id } });

    // ========== 2. BRANCHES ==========
    const dubaiHq = await db.branch.create({
      data: {
        name: 'Dubai HQ',
        address: 'Office 1205, Aspect Tower, Business Bay',
        emirate: 'Dubai',
        phone: '+97141234567',
        organizationId: org.id,
      },
    });

    const abuDhabi = await db.branch.create({
      data: {
        name: 'Abu Dhabi Branch',
        address: 'Unit 802, Al Sila Tower, ADGM Square',
        emirate: 'Abu Dhabi',
        phone: '+97126543210',
        organizationId: org.id,
      },
    });
    results.branches = 2;

    // ========== 3. CREATE VEHICLES ==========
    let vehicles = await db.vehicle.findMany({ where: { organizationId: org.id } });
    if (vehicles.length === 0) {
      const vehicleData = [
        { plateNumber: 'DXB-A-12345', vehicleType: 'Heavy Truck', make: 'Isuzu', model: 'FTR 800', year: 2023, mileage: 45230, color: 'White' },
        { plateNumber: 'AUH-C-11111', vehicleType: 'Light Truck', make: 'Toyota', model: 'Hilux', year: 2024, mileage: 78500, color: 'Silver' },
        { plateNumber: 'DXB-D-22222', vehicleType: 'Van', make: 'Nissan', model: 'Urvan', year: 2022, mileage: 123400, color: 'White' },
        { plateNumber: 'SHJ-E-33333', vehicleType: 'Heavy Truck', make: 'Mitsubishi', model: 'Fuso Canter', year: 2023, mileage: 56780, color: 'Blue' },
        { plateNumber: 'DXB-B-67890', vehicleType: 'Refrigerated Truck', make: 'Hino', model: '500 Series', year: 2024, mileage: 156200, color: 'White' },
        { plateNumber: 'DXB-F-44444', vehicleType: 'Light Truck', make: 'Ford', model: 'Transit', year: 2023, mileage: 89300, color: 'White' },
        { plateNumber: 'DXB-G-55555', vehicleType: 'Pickup', make: 'Toyota', model: 'Land Cruiser 79', year: 2024, mileage: 34100, color: 'Black' },
      ];
      for (const vd of vehicleData) {
        const v = await db.vehicle.create({
          data: { ...vd, status: 'active', organizationId: org.id, installDate: new Date(2025, 0, 15) },
        });
        vehicles.push(v);
      }
    }
    results.vehicles = vehicles.length;

    // ========== 3b. CREATE DRIVERS ==========
    let drivers = await db.driver.findMany({ where: { organizationId: org.id } });
    if (drivers.length === 0) {
      const driverData = [
        { name: 'Ali Hassan', phone: '+971501112233', emirate: 'Dubai', nationality: 'Pakistani', licenseType: 'Heavy', licenseExpiry: new Date(2027, 5, 15), score: 92, totalDistance: 125400, totalViolations: 2, totalTrips: 342 },
        { name: 'Omar Khalid', phone: '+971502223344', emirate: 'Abu Dhabi', nationality: 'Egyptian', licenseType: 'Heavy', licenseExpiry: new Date(2027, 3, 20), score: 78, totalDistance: 189300, totalViolations: 8, totalTrips: 489 },
        { name: 'Rajesh Kumar', phone: '+971503334455', emirate: 'Sharjah', nationality: 'Indian', licenseType: 'Light', licenseExpiry: new Date(2027, 1, 10), score: 65, totalDistance: 95600, totalViolations: 15, totalTrips: 267 },
      ];
      for (const dd of driverData) {
        const d = await db.driver.create({
          data: { ...dd, status: 'active', organizationId: org.id },
        });
        drivers.push(d);
      }
    }
    results.drivers = drivers.length;

    // Link vehicles to drivers and branches
    for (let i = 0; i < vehicles.length; i++) {
      await db.vehicle.update({
        where: { id: vehicles[i].id },
        data: {
          branchId: i < 5 ? dubaiHq.id : abuDhabi.id,
          driverId: drivers[i % drivers.length].id,
          mileage: [45230, 78500, 123400, 56780, 156200, 89300, 34100][i] || 50000,
          installDate: new Date(2025, Math.floor(Math.random() * 6), Math.floor(Math.random() * 28) + 1),
        },
      });
    }

    // ========== 4. SIM CARDS ==========
    const simData = [
      { number: '+971501111001', provider: 'Etisalat', dataPlan: '1GB Monthly' },
      { number: '+971501111002', provider: 'Etisalat', dataPlan: '1GB Monthly' },
      { number: '+971501111003', provider: 'du', dataPlan: '500MB Monthly' },
      { number: '+971501111004', provider: 'Etisalat', dataPlan: '1GB Monthly' },
      { number: '+971501111005', provider: 'du', dataPlan: '1GB Monthly' },
      { number: '+971501111006', provider: 'Etisalat', dataPlan: '500MB Monthly' },
      { number: '+971501111007', provider: 'du', dataPlan: '1GB Monthly' },
      { number: '+971501111008', provider: 'Etisalat', dataPlan: '1GB Monthly' },
    ];

    const createdSims: string[] = [];
    for (const sim of simData) {
      const created = await db.sIM.create({
        data: {
          ...sim,
          status: 'active',
          activatedAt: new Date(2025, 0, 10),
          organizationId: org.id,
        },
      });
      createdSims.push(created.id);
    }
    results.sims = createdSims.length;

    // ========== 5. DEVICES ==========
    const deviceData = [
      { imei: '867730040001001', model: 'GT06N', manufacturer: 'Concox', deviceType: 'GPS Tracker', protocol: 'GT06' },
      { imei: '867730040001002', model: 'GT06N', manufacturer: 'Concox', deviceType: 'GPS Tracker', protocol: 'GT06' },
      { imei: '867730040001003', model: 'FMB920', manufacturer: 'Teltonika', deviceType: 'GPS Tracker', protocol: 'FMB' },
      { imei: '867730040001004', model: 'FMB920', manufacturer: 'Teltonika', deviceType: 'GPS Tracker', protocol: 'FMB' },
      { imei: '867730040001005', model: 'GT06N', manufacturer: 'Concox', deviceType: 'GPS Tracker', protocol: 'GT06' },
      { imei: '867730040001006', model: 'TK103', manufacturer: 'Queclink', deviceType: 'GPS Tracker', protocol: 'TK103' },
      { imei: '867730040001007', model: 'FMB140', manufacturer: 'Teltonika', deviceType: 'GPS Tracker', protocol: 'FMB' },
      { imei: '867730040001008', model: 'GT06N', manufacturer: 'Concox', deviceType: 'GPS Tracker', protocol: 'GT06' },
    ];

    const createdDevices: string[] = [];
    for (let i = 0; i < deviceData.length; i++) {
      const isInstalled = i < vehicles.length;
      const device = await db.device.create({
        data: {
          ...deviceData[i],
          serialNumber: `SN-${deviceData[i].imei.slice(-6)}`,
          phoneNumber: simData[i].number,
          firmware: isInstalled ? 'v3.2.1' : 'v3.1.0',
          simId: createdSims[i],
          organizationId: org.id,
          status: isInstalled ? 'installed' : 'warehouse',
          warehouse: isInstalled ? null : 'Dubai Warehouse',
          purchaseDate: new Date(2024, 11, 15),
          purchaseCost: 350,
          installDate: isInstalled ? new Date(2025, 0, 15 + i) : null,
          warrantyExpiry: new Date(2027, 0, 15),
          lastPingAt: isInstalled ? new Date(Date.now() - Math.random() * 300000) : null,
          batteryLevel: isInstalled ? Math.floor(Math.random() * 30 + 70) : 100,
        },
      });
      createdDevices.push(device.id);

      // Link device to vehicle
      if (isInstalled && i < vehicles.length) {
        await db.vehicle.update({
          where: { id: vehicles[i].id },
          data: { deviceId: device.id },
        });
      }
    }
    results.devices = createdDevices.length;

    // ========== 6. TECHNICIANS ==========
    const techs = [
      { name: 'Rashid Khan', phone: '+971504456789', email: 'rashid@rtr.ae', emirate: 'Dubai', specialty: 'GPS Installation', totalInstalled: 156, rating: 4.8 },
      { name: 'Mohammed Siddiq', phone: '+971505567890', email: 'mohammed.s@rtr.ae', emirate: 'Abu Dhabi', specialty: 'GPS & Camera', totalInstalled: 98, rating: 4.5 },
      { name: 'Waseem Shah', phone: '+971506678901', email: 'waseem@rtr.ae', emirate: 'Sharjah', specialty: 'Fleet Diagnostics', totalInstalled: 73, rating: 4.6 },
    ];

    const createdTechs: string[] = [];
    for (const t of techs) {
      const tech = await db.technician.create({
        data: { ...t, organizationId: org.id, status: 'active' },
      });
      createdTechs.push(tech.id);
    }
    results.technicians = createdTechs.length;

    // ========== 7. INSTALLATIONS ==========
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const installData: any[] = vehicles.map((v, i) => ({
      installationNumber: `INS-2025-${String(i + 1).padStart(4, '0')}`,
      vehicleId: v.id,
      deviceId: createdDevices[i],
      technicianId: createdTechs[i % createdTechs.length],
      status: 'completed',
      scheduledDate: new Date(2025, 0, 10 + i),
      scheduledTime: `${9 + (i % 4)}:00`,
      completedAt: new Date(2025, 0, 10 + i, 10 + (i % 3)),
      emirate: i < 5 ? 'Dubai' : 'Abu Dhabi',
      location: i < 5 ? 'Al Quoz Industrial Area, Dubai' : 'Mussafah Industrial, Abu Dhabi',
      latitude: i < 5 ? 25.141 + (i * 0.005) : 24.353 + (i * 0.003),
      longitude: i < 5 ? 55.185 + (i * 0.008) : 54.477 + (i * 0.005),
      testResult: 'passed',
      gpsSignal: true,
      powerWiring: true,
      antennaMounted: true,
      organizationId: org.id,
    }));

    // Add one pending installation for the 8th device
    installData.push({
      installationNumber: 'INS-2025-0008',
      vehicleId: vehicles[0].id, // Will be reassigned
      deviceId: createdDevices[7],
      technicianId: createdTechs[0],
      status: 'scheduled',
      scheduledDate: new Date(Date.now() + 3 * 86400000),
      scheduledTime: '10:00',
      emirate: 'Dubai',
      location: 'JAFZA, Dubai',
      latitude: 25.0,
      longitude: 55.1,
      organizationId: org.id,
    });

    for (const inst of installData) {
      await db.installation.create({ data: inst });
    }
    results.installations = installData.length;

    // ========== 8. TRIPS (Last 30 days, ~5-8 per vehicle) ==========
    const now = new Date();
    const tripRecords: Prisma.TripCreateManyInput[] = [];

    // UAE route templates for realistic data
    const routes = [
      { from: 'Jebel Ali Port', to: 'Dubai Silicon Oasis', baseDist: 35, baseDur: 45 },
      { from: 'Mussafah', to: 'Khalifa Port', baseDist: 42, baseDur: 55 },
      { from: 'Deira Warehouse', to: 'DIP', baseDist: 28, baseDur: 35 },
      { from: 'Sharjah SAIF Zone', to: 'Dubai Airport', baseDist: 32, baseDur: 40 },
      { from: 'Al Ain Industrial', to: 'Dubai Investment Park', baseDist: 145, baseDur: 110 },
      { from: 'RAK Industrial', to: 'Dubai Dry Dock', baseDist: 120, baseDur: 95 },
      { from: 'Fujairah Port', to: 'Dubai, JAFZA', baseDist: 155, baseDur: 120 },
      { from: 'Ajman Industrial', to: 'Dubai Marina', baseDist: 38, baseDur: 45 },
    ];

    for (let vIdx = 0; vIdx < vehicles.length; vIdx++) {
      const v = vehicles[vIdx];
      const driverName = v.driverId
        ? drivers.find(d => d.id === v.driverId)?.name || `Driver ${vIdx + 1}`
        : `Driver ${vIdx + 1}`;

      const numTrips = 5 + Math.floor(Math.random() * 4); // 5-8 trips
      for (let t = 0; t < numTrips; t++) {
        const route = routes[(vIdx + t) % routes.length];
        const daysAgo = Math.floor(Math.random() * 30);
        const startHour = 5 + Math.floor(Math.random() * 14); // 5am-7pm
        const startTime = new Date(now);
        startTime.setDate(startTime.getDate() - daysAgo);
        startTime.setHours(startHour, Math.floor(Math.random() * 60), 0, 0);

        const duration = route.baseDur + Math.floor((Math.random() - 0.5) * 20);
        const distance = route.baseDist + Math.round((Math.random() - 0.5) * 10);
        const maxSpeed = 80 + Math.floor(Math.random() * 50);
        const avgSpeed = Math.round((distance / duration) * 60);
        const idleTime = Math.floor(duration * 0.12 + Math.random() * 10);
        const isCompleted = daysAgo > 0 || startTime.getHours() < 20;

        tripRecords.push({
          vehicleId: v.id,
          organizationId: org.id,
          driverName,
          startTime,
          endTime: isCompleted ? new Date(startTime.getTime() + duration * 60000) : null,
          distance,
          duration: isCompleted ? duration : null,
          maxSpeed,
          avgSpeed,
          idleTime,
          overspeedCount: Math.floor(Math.random() * 6),
          harshBrakes: Math.floor(Math.random() * 4),
          harshAccel: Math.floor(Math.random() * 3),
          status: isCompleted ? 'completed' : 'in_progress',
        });
      }
    }

    // Create trips in batches
    const BATCH_SIZE = 20;
    for (let i = 0; i < tripRecords.length; i += BATCH_SIZE) {
      await db.trip.createMany({ data: tripRecords.slice(i, i + BATCH_SIZE) });
    }
    results.trips = tripRecords.length;

    // ========== 9. MAINTENANCE RECORDS ==========
    const maintTypes = ['oil_change', 'tire_rotation', 'brake_service', 'battery_replacement', 'ac_service', 'general_service', 'engine_tuning'];
    const maintDescriptions: Record<string, string> = {
      oil_change: 'Full synthetic oil change with filter replacement',
      tire_rotation: 'Tire rotation and wheel alignment check',
      brake_service: 'Brake pad replacement and brake fluid top-up',
      battery_replacement: 'Battery replacement and charging system check',
      ac_service: 'AC gas refill and compressor inspection',
      general_service: 'Full vehicle inspection and general service',
      engine_tuning: 'Engine tuning and diagnostic scan',
    };
    const maintCosts: Record<string, number> = {
      oil_change: 350, tire_rotation: 200, brake_service: 1200,
      battery_replacement: 800, ac_service: 600, general_service: 500, engine_tuning: 900,
    };

    const maintRecords: Prisma.MaintenanceRecordCreateManyInput[] = [];
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];

      // 2-3 completed maintenance records per vehicle
      const numCompleted = 2 + Math.floor(Math.random() * 2);
      for (let j = 0; j < numCompleted; j++) {
        const type = maintTypes[(i + j) % maintTypes.length];
        const daysAgo = 10 + j * 25 + Math.floor(Math.random() * 10);
        const completedDate = new Date(now);
        completedDate.setDate(completedDate.getDate() - daysAgo);

        maintRecords.push({
          vehicleId: v.id,
          organizationId: org.id,
          type,
          description: maintDescriptions[type],
          triggerType: j === 0 ? 'mileage' : 'time',
          triggerValue: 10000 + j * 5000,
          scheduledDate: new Date(completedDate.getTime() - 3 * 86400000),
          completedDate,
          cost: maintCosts[type] + Math.floor((Math.random() - 0.5) * 100),
          status: 'completed',
        });
      }

      // 1 upcoming/overdue maintenance per vehicle
      const upcomingType = maintTypes[(i + 3) % maintTypes.length];
      const scheduledDate = new Date(now);
      const isOverdue = i === 2; // SHJ-E-33333 (maintenance status) should have overdue
      scheduledDate.setDate(scheduledDate.getDate() - (isOverdue ? 5 : -10 - i * 3));

      maintRecords.push({
        vehicleId: v.id,
        organizationId: org.id,
        type: upcomingType,
        description: maintDescriptions[upcomingType],
        triggerType: 'mileage',
        triggerValue: 20000,
        scheduledDate,
        cost: maintCosts[upcomingType],
        status: isOverdue ? 'overdue' : 'upcoming',
      });
    }

    for (let i = 0; i < maintRecords.length; i += BATCH_SIZE) {
      await db.maintenanceRecord.createMany({ data: maintRecords.slice(i, i + BATCH_SIZE) });
    }
    results.maintenanceRecords = maintRecords.length;

    // ========== 10. GEOFENCES ==========
    const geofences = [
      { name: 'Jebel Ali Port Zone', type: 'circle', centerLat: 25.018, centerLng: 55.08, radius: 2000, orgId: org.id },
      { name: 'Dubai Airport Free Zone', type: 'circle', centerLat: 25.252, centerLng: 55.365, radius: 1500, orgId: org.id },
      { name: 'Mussafah Industrial Area', type: 'circle', centerLat: 24.353, centerLng: 54.487, radius: 3000, orgId: org.id },
      { name: 'Sharjah SAIF Zone', type: 'circle', centerLat: 25.322, centerLng: 55.415, radius: 1200, orgId: org.id },
      { name: 'Khalifa Port Area', type: 'circle', centerLat: 24.853, centerLng: 54.661, radius: 2500, orgId: org.id },
    ];

    for (const g of geofences) {
      await db.geofence.create({
        data: {
          name: g.name,
          type: g.type,
          centerLat: g.centerLat,
          centerLng: g.centerLng,
          radius: g.radius,
          organizationId: g.orgId,
        },
      });
    }
    results.geofences = geofences.length;

    // ========== 11. ALERT RULES ==========
    const alertRules = [
      { name: 'Speed Limit Exceeded', type: 'overspeed', conditions: JSON.stringify({ threshold: 120, unit: 'km/h' }), channels: 'in_app,sms', active: true },
      { name: 'Geofence Exit Alert', type: 'geofence_exit', conditions: JSON.stringify({ geofenceIds: geofences.map((_, i) => i).slice(0, 3) }), channels: 'in_app,email', active: true },
      { name: 'Harsh Braking Detection', type: 'harsh_braking', conditions: JSON.stringify({ threshold: 3, window: '1h' }), channels: 'in_app', active: true },
      { name: 'Device Offline Alert', type: 'device_offline', conditions: JSON.stringify({ timeout: 30, unit: 'min' }), channels: 'in_app,sms', active: true },
      { name: 'Maintenance Due Reminder', type: 'maintenance_due', conditions: JSON.stringify({ daysBefore: 7 }), channels: 'in_app,email', active: true },
    ];

    for (const rule of alertRules) {
      await db.alertRule.create({
        data: { ...rule, organizationId: org.id },
      });
    }
    results.alertRules = alertRules.length;

    // ========== 12. ALERTS ==========
    const alertData = [
      { type: 'overspeed', severity: 'high', vehiclePlate: 'DXB-A-12345', driverName: drivers[0]?.name || 'Driver 1', message: 'Speed exceeded 128 km/h on Sheikh Zayed Road', status: 'open', daysAgo: 0 },
      { type: 'geofence_exit', severity: 'medium', vehiclePlate: 'AUH-C-11111', driverName: drivers[1]?.name || 'Driver 2', message: 'Vehicle exited Jebel Ali Port Zone', status: 'open', daysAgo: 0 },
      { type: 'harsh_braking', severity: 'medium', vehiclePlate: 'DXB-D-22222', driverName: drivers[2]?.name || 'Driver 3', message: '3 harsh braking events detected in last hour', status: 'open', daysAgo: 1 },
      { type: 'device_offline', severity: 'high', vehiclePlate: 'SHJ-E-33333', driverName: null, message: 'Device offline for more than 45 minutes', status: 'acknowledged', daysAgo: 0 },
      { type: 'maintenance_due', severity: 'low', vehiclePlate: 'DXB-B-67890', driverName: null, message: 'Oil change due in 3 days (mileage-based)', status: 'open', daysAgo: 2 },
      { type: 'overspeed', severity: 'high', vehiclePlate: 'DXB-F-44444', driverName: drivers[1]?.name || 'Driver 2', message: 'Speed exceeded 135 km/h on E11', status: 'resolved', daysAgo: 3 },
      { type: 'geofence_exit', severity: 'medium', vehiclePlate: 'DXB-G-55555', driverName: drivers[0]?.name || 'Driver 1', message: 'Vehicle exited Dubai Airport Free Zone', status: 'resolved', daysAgo: 4 },
      { type: 'harsh_braking', severity: 'low', vehiclePlate: 'DXB-A-12345', driverName: drivers[2]?.name || 'Driver 3', message: '1 harsh braking event on Al Khail Road', status: 'resolved', daysAgo: 5 },
      { type: 'idle', severity: 'low', vehiclePlate: 'AUH-C-11111', driverName: drivers[0]?.name || 'Driver 1', message: 'Vehicle idle for more than 30 minutes at Mussafah', status: 'resolved', daysAgo: 6 },
      { type: 'overspeed', severity: 'medium', vehiclePlate: 'DXB-D-22222', driverName: drivers[1]?.name || 'Driver 2', message: 'Speed exceeded 115 km/h on Emirates Road', status: 'resolved', daysAgo: 7 },
      { type: 'fuel_drop', severity: 'high', vehiclePlate: 'DXB-B-67890', driverName: drivers[2]?.name || 'Driver 3', message: 'Sudden fuel level drop detected (possible theft)', status: 'open', daysAgo: 1 },
      { type: 'maintenance_due', severity: 'medium', vehiclePlate: 'SHJ-E-33333', driverName: null, message: 'Brake service overdue by 5 days', status: 'open', daysAgo: 0 },
      { type: 'geofence_exit', severity: 'high', vehiclePlate: 'DXB-F-44444', driverName: drivers[0]?.name || 'Driver 1', message: 'Vehicle exited authorized operating area', status: 'acknowledged', daysAgo: 2 },
      { type: 'device_offline', severity: 'medium', vehiclePlate: 'DXB-G-55555', driverName: null, message: 'Device last ping was 25 minutes ago', status: 'resolved', daysAgo: 8 },
      { type: 'harsh_accel', severity: 'low', vehiclePlate: 'AUH-C-11111', driverName: drivers[1]?.name || 'Driver 2', message: '2 harsh acceleration events detected', status: 'resolved', daysAgo: 3 },
    ];

    for (const a of alertData) {
      const vehicle = vehicles.find(v => v.plateNumber === a.vehiclePlate);
      const createdAt = new Date(now);
      createdAt.setDate(createdAt.getDate() - a.daysAgo);
      createdAt.setHours(8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60));

      await db.alert.create({
        data: {
          type: a.type,
          severity: a.severity,
          vehicleId: vehicle?.id,
          driverName: a.driverName,
          vehiclePlate: a.vehiclePlate,
          message: a.message,
          status: a.status,
          organizationId: org.id,
          createdAt,
          resolvedAt: a.status === 'resolved' ? new Date(createdAt.getTime() + 3600000) : null,
        },
      });
    }
    results.alerts = alertData.length;

    // ========== 13. INVOICES ==========
    const subscription = await db.subscription.findFirst({ where: { organizationId: org.id } });

    const invoiceData = [
      { num: 'INV-2026-001', amount: 799, status: 'paid', monthsAgo: 6, paidDaysAgo: 175 },
      { num: 'INV-2026-002', amount: 799, status: 'paid', monthsAgo: 5, paidDaysAgo: 145 },
      { num: 'INV-2026-003', amount: 799, status: 'paid', monthsAgo: 4, paidDaysAgo: 115 },
      { num: 'INV-2026-004', amount: 799, status: 'paid', monthsAgo: 3, paidDaysAgo: 85 },
      { num: 'INV-2026-005', amount: 799, status: 'paid', monthsAgo: 2, paidDaysAgo: 55 },
      { num: 'INV-2026-006', amount: 799, status: 'paid', monthsAgo: 1, paidDaysAgo: 25 },
      { num: 'INV-2026-007', amount: 799, status: 'paid', monthsAgo: 0, paidDaysAgo: 2 },
      { num: 'INV-2026-008', amount: 1250, status: 'pending', monthsAgo: 0, paidDaysAgo: null },
      { num: 'INV-2026-009', amount: 350, status: 'overdue', monthsAgo: -1, paidDaysAgo: null },
    ];

    for (const inv of invoiceData) {
      const createdAt = new Date(now.getFullYear(), now.getMonth() - inv.monthsAgo, 1);
      const dueDate = new Date(createdAt);
      dueDate.setDate(dueDate.getDate() + 30);

      await db.invoice.create({
        data: {
          invoiceNumber: inv.num,
          organizationId: org.id,
          subscriptionId: subscription?.id,
          amount: inv.amount,
          tax: Math.round(inv.amount * 0.05),
          total: Math.round(inv.amount * 1.05),
          status: inv.status,
          dueDate,
          paidAt: inv.paidDaysAgo ? new Date(now.getTime() - inv.paidDaysAgo * 86400000) : null,
          notes: inv.status === 'paid' ? 'Monthly subscription fee' : inv.status === 'overdue' ? 'Overdue - device replacement charge' : 'Additional device installation',
        },
      });
    }
    results.invoices = invoiceData.length;

    // ========== 14. QUOTATIONS ==========
    const quotationData = [
      {
        num: 'QUO-2026-001', status: 'sent', subtotal: 4750, taxRate: 5,
        items: [
          { desc: 'GPS Tracking Device Supply & Installation (x10)', qty: 10, price: 350 },
          { desc: 'SIM Cards with 1-Year Data Plan (x10)', qty: 10, price: 80 },
          { desc: 'Professional Installation Labor', qty: 10, price: 45 },
        ],
        validDays: 30,
      },
      {
        num: 'QUO-2026-002', status: 'accepted', subtotal: 8925, taxRate: 5,
        items: [
          { desc: 'Fleet Management Platform - Annual License (20 Vehicles)', qty: 1, price: 5400 },
          { desc: 'GPS Tracker GT06N with Installation (x20)', qty: 20, price: 135 },
          { desc: 'Dashboard Camera - Dual Lens (x20)', qty: 20, price: 95 },
        ],
        validDays: 30,
      },
      {
        num: 'QUO-2026-003', status: 'draft', subtotal: 2200, taxRate: 5,
        items: [
          { desc: 'GPS Tracking Device FMB920 (x5)', qty: 5, price: 380 },
          { desc: 'Installation & Configuration Service', qty: 5, price: 60 },
        ],
        validDays: 14,
      },
    ];

    for (const q of quotationData) {
      const tax = Math.round(q.subtotal * q.taxRate / 100);
      const total = q.subtotal + tax;
      const validUntil = new Date(now);
      validUntil.setDate(validUntil.getDate() + q.validDays);

      const quotation = await db.quotation.create({
        data: {
          quotationNumber: q.num,
          organizationId: org.id,
          subtotal: q.subtotal,
          taxRate: q.taxRate,
          tax,
          total,
          status: q.status,
          validUntil,
          terms: 'Payment due within 30 days of acceptance. Prices valid for 15 days from quotation date.',
          notes: 'Includes 12-month warranty on hardware and free technical support.',
        },
      });

      for (let idx = 0; idx < q.items.length; idx++) {
        await db.quotationItem.create({
          data: {
            quotationId: quotation.id,
            sortOrder: idx + 1,
            description: q.items[idx].desc,
            quantity: q.items[idx].qty,
            unitPrice: q.items[idx].price,
          },
        });
      }
    }
    results.quotations = quotationData.length;

    // ========== 15. CRM CONTACTS ==========
    const contacts = [
      { name: 'Khalid Al Mansoori', email: 'khalid@alfuttaim.ae', phone: '+971507789012', position: 'Fleet Manager' },
      { name: 'Priya Sharma', email: 'priya@brighttransport.ae', phone: '+971508890123', position: 'Operations Director' },
      { name: 'Omar Al Suwaidi', email: 'omar@gulfexpress.ae', phone: '+971509990234', position: 'CEO' },
      { name: 'James Mitchell', email: 'james@transgloballogistics.com', phone: '+971501190345', position: 'Logistics Manager' },
      { name: 'Sara Al Qasimi', email: 'sara@emiratescargo.ae', phone: '+971502290456', position: 'Procurement Head' },
    ];

    const createdContacts: string[] = [];
    for (const c of contacts) {
      const contact = await db.contact.create({
        data: { ...c, organizationId: org.id },
      });
      createdContacts.push(contact.id);
    }
    results.contacts = createdContacts.length;

    // ========== 16. OPPORTUNITIES ==========
    const opportunities = [
      { name: 'Al Futtaim Logistics - Fleet Tracking', value: 4750, stage: 'proposal', leadId: null, assignedTo: fleetManager?.id, expectedCloseDays: 15 },
      { name: 'Bright Transport - Full Platform', value: 8925, stage: 'negotiation', leadId: null, assignedTo: adminUser?.id, expectedCloseDays: 7 },
      { name: 'Gulf Express Cargo - GPS Devices', value: 2200, stage: 'discovery', leadId: null, assignedTo: fleetManager?.id, expectedCloseDays: 30 },
      { name: 'Emirates Cargo Solutions', value: 15000, stage: 'new', leadId: null, assignedTo: opsUser?.id, expectedCloseDays: 45 },
    ];

    for (const opp of opportunities) {
      await db.opportunity.create({
        data: {
          name: opp.name,
          value: opp.value,
          stage: opp.stage,
          organizationId: org.id,
          assignedToId: opp.assignedTo,
          expectedClose: new Date(now.getTime() + opp.expectedCloseDays * 86400000),
          notes: 'Initial discussions in progress. Follow up next week.',
        },
      });
    }
    results.opportunities = opportunities.length;

    // ========== 17. TICKETS ==========
    const tickets = [
      { num: 'TKT-2026-001', subject: 'GPS signal intermittent on DXB-B-67890', desc: 'Device shows offline intermittently during peak hours.', priority: 'high', vehiclePlate: 'DXB-B-67890', assignedTo: fleetManager?.id, status: 'open' },
      { num: 'TKT-2026-002', subject: 'Request additional vehicle to fleet', desc: 'Need to add 3 new refrigerated trucks by next month.', priority: 'medium', vehiclePlate: null, assignedTo: opsUser?.id, status: 'open' },
      { num: 'TKT-2026-003', subject: 'Monthly report not generating', desc: 'Reports page shows error when selecting 12-month period.', priority: 'low', vehiclePlate: null, assignedTo: adminUser?.id, status: 'in_progress' },
    ];

    for (const t of tickets) {
      await db.ticket.create({
        data: {
          ticketNumber: t.num,
          organizationId: org.id,
          subject: t.subject,
          description: t.desc,
          priority: t.priority,
          status: t.status,
          vehiclePlate: t.vehiclePlate,
          assignedToId: t.assignedTo,
        },
      });
    }
    results.tickets = tickets.length;

    // ========== 18. ACTIVITIES ==========
    const activities = [
      { type: 'call', title: 'Called Al Futtaim Logistics', desc: 'Discussed fleet tracking requirements for 10 vehicles', userId: fleetManager?.id, daysAgo: 1 },
      { type: 'meeting', title: 'Meeting with Bright Transport', desc: 'Product demo at their office in Dubai Media City', userId: adminUser?.id, daysAgo: 2 },
      { type: 'email', title: 'Sent quotation to Gulf Express', desc: 'Quotation QUO-2026-003 sent for GPS tracker supply', userId: fleetManager?.id, daysAgo: 3 },
      { type: 'note', title: 'Follow up with Emirates Cargo', desc: 'Need to schedule a demo for their fleet of 25 vehicles', userId: opsUser?.id, daysAgo: 1 },
      { type: 'task', title: 'Prepare Q3 fleet report', desc: 'Compile fleet utilization and maintenance report for Q3', userId: opsUser?.id, daysAgo: 0, dueDays: 5 },
      { type: 'call', title: 'Technician visit scheduled', desc: 'Rashid Khan to visit Jebel Ali for device check', userId: fleetManager?.id, daysAgo: 4 },
      { type: 'meeting', title: 'Weekly operations review', desc: 'Review trip data and driver performance scores', userId: adminUser?.id, daysAgo: 0 },
    ];

    for (const a of activities) {
      const createdAt = new Date(now);
      createdAt.setDate(createdAt.getDate() - a.daysAgo);

      await db.activity.create({
        data: {
          type: a.type,
          title: a.title,
          description: a.desc,
          userId: a.userId,
          organizationId: org.id,
          dueDate: a.dueDays ? new Date(now.getTime() + a.dueDays * 86400000) : null,
          completed: a.daysAgo > 2,
          createdAt,
        },
      });
    }
    results.activities = activities.length;

    // ========== 19. NOTIFICATIONS ==========
    const notifData = [
      { type: 'alert', title: 'Speed Alert', body: 'DXB-A-12345 exceeded speed limit at 128 km/h', userId: adminUser?.id, daysAgo: 0 },
      { type: 'system', title: 'New Lead Assigned', body: 'Lead "Trans Global Logistics" was assigned to you', userId: opsUser?.id, daysAgo: 1 },
      { type: 'maintenance', title: 'Maintenance Due', body: 'SHJ-E-33333 brake service is overdue', userId: fleetManager?.id, daysAgo: 0 },
      { type: 'system', title: 'Invoice Generated', body: 'Invoice INV-2026-008 for AED 1,312.50 has been generated', userId: adminUser?.id, daysAgo: 2 },
      { type: 'alert', title: 'Device Offline', body: 'SHJ-E-33333 device has been offline for 45 minutes', userId: fleetManager?.id, daysAgo: 0 },
    ];

    for (const n of notifData) {
      const createdAt = new Date(now);
      createdAt.setDate(createdAt.getDate() - n.daysAgo);
      createdAt.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60));

      await db.notification.create({
        data: {
          userId: n.userId,
          organizationId: org.id,
          type: n.type,
          title: n.title,
          body: n.body,
          read: n.daysAgo > 1,
          createdAt,
        },
      });
    }
    results.notifications = notifData.length;

    // ========== 20. CONTRACTS ==========
    await db.contract.create({
      data: {
        organizationId: org.id,
        title: 'Master Service Agreement - RTR 360 Platform',
        startDate: new Date(2025, 0, 1),
        endDate: new Date(2026, 11, 31),
        status: 'active',
        terms: 'Annual subscription for fleet management platform with GPS tracking, analytics, and AI-powered insights. Includes support and maintenance.',
      },
    });
    results.contracts = 1;

    // ========== 21. PLATFORM SETTINGS ==========
    const settingsData = [
      { key: 'platform_name', value: 'RTR 360', type: 'string' },
      { key: 'default_currency', value: 'AED', type: 'string' },
      { key: 'default_timezone', value: 'Asia/Dubai', type: 'string' },
      { key: 'speed_limit_threshold', value: '120', type: 'number' },
      { key: 'idle_timeout_minutes', value: '15', type: 'number' },
      { key: 'maintenance_reminder_days', value: '7', type: 'number' },
      { key: 'geofence_enter_alert', value: 'true', type: 'boolean' },
      { key: 'geofence_exit_alert', value: 'true', type: 'boolean' },
      { key: 'ai_analytics_enabled', value: 'true', type: 'boolean' },
      { key: 'dashboard_refresh_interval', value: '30', type: 'number' },
    ];

    for (const s of settingsData) {
      await db.setting.upsert({
        where: { key: s.key },
        update: { value: s.value },
        create: { key: s.key, value: s.value, type: s.type },
      });
    }
    results.settings = settingsData.length;

    // ========== 22. SECOND ORGANIZATION — Gulf Express Cargo LLC ==========
    const existingOrgs = await db.organization.count();
    if (existingOrgs <= 1) {
      const org2 = await db.organization.create({
        data: {
          name: 'Gulf Express Cargo LLC',
          tradeName: 'Gulf Express',
          email: 'info@gulfexpress.ae',
          phone: '+971509990234',
          emirate: 'Sharjah',
          city: 'Sharjah',
          country: 'AE',
          address: 'Industrial Area 12, Sharjah, UAE',
          currency: 'AED',
          status: 'active',
        },
      });
      results.org2 = org2.name;

      // Plan for org2
      const plan2 = await db.plan.findFirst({ where: { name: 'Enterprise' } }) || await db.plan.create({
        data: { name: 'Enterprise', vehicleLimit: 50, priceMonthly: 150, description: 'All Pro features, API Access, Custom Integrations, Dedicated Support', active: true },
      });

      // Subscription
      await db.subscription.create({
        data: { organizationId: org2.id, planId: plan2.id, status: 'active', startsAt: new Date(), endsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), vehicleCount: 5 },
      });

      // Admin user for org2
      const org2Password = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
      const org2Admin = await db.user.create({
        data: { email: 'admin@gulfexpress.ae', passwordHash: await hashPassword(org2Password), name: 'Omar Al Suwaidi', phone: '+971509990234', role: 'org_owner', organizationId: org2.id, status: 'active', emailVerified: true },
      });
      results.org2Admin = { email: org2Admin.email, generatedPassword: org2Password };

      // Manager for org2
      const org2Mgr = await db.user.create({
        data: { email: 'manager@gulfexpress.ae', passwordHash: await hashPassword('manager456'), name: 'Bilal Ahmed', phone: '+971508887766', role: 'manager', organizationId: org2.id, status: 'active', emailVerified: true },
      });

      // Branch
      const org2Branch = await db.branch.create({
        data: { name: 'Sharjah Main Office', address: 'Industrial Area 12, Al Sajaa', emirate: 'Sharjah', phone: '+97165123456', organizationId: org2.id },
      });

      // Vehicles for org2
      const org2VehicleData = [
        { plateNumber: 'SHJ-A-11111', vehicleType: 'Heavy Truck', make: 'Isuzu', model: 'NPR 75', year: 2024, mileage: 23400, color: 'White' },
        { plateNumber: 'SHJ-A-22222', vehicleType: 'Light Truck', make: 'Mitsubishi', model: 'Canter', year: 2023, mileage: 67800, color: 'Silver' },
        { plateNumber: 'SHJ-B-33333', vehicleType: 'Refrigerated Truck', make: 'Hino', model: '300 Series', year: 2024, mileage: 15600, color: 'White' },
        { plateNumber: 'SHJ-C-44444', vehicleType: 'Van', make: 'Toyota', model: 'HiAce', year: 2023, mileage: 89200, color: 'Blue' },
        { plateNumber: 'SHJ-D-55555', vehicleType: 'Pickup', make: 'Nissan', model: 'Navara', year: 2024, mileage: 32100, color: 'Black' },
      ];
      const org2Vehicles: string[] = [];
      for (const vd of org2VehicleData) {
        const v = await db.vehicle.create({ data: { ...vd, status: 'active', organizationId: org2.id, branchId: org2Branch.id, installDate: new Date(2025, 2, 15) } });
        org2Vehicles.push(v.id);
      }
      results.org2Vehicles = org2Vehicles.length;

      // Drivers for org2
      const org2DriverData = [
        { name: 'Ahmed Al Naqbi', phone: '+971503334444', nationality: 'Emirati', licenseType: 'Heavy', licenseExpiry: new Date(2028, 0, 1), score: 88, totalDistance: 67800, totalViolations: 3, totalTrips: 189 },
        { name: 'Saeed Al Khateeb', phone: '+971504445555', nationality: 'Jordanian', licenseType: 'Heavy', licenseExpiry: new Date(2027, 6, 15), score: 74, totalDistance: 123400, totalViolations: 11, totalTrips: 312 },
        { name: 'Tariq Mehmood', phone: '+971505556666', nationality: 'Pakistani', licenseType: 'Light', licenseExpiry: new Date(2027, 3, 20), score: 82, totalDistance: 45600, totalViolations: 5, totalTrips: 145 },
      ];
      const org2DriverIds: string[] = [];
      for (const dd of org2DriverData) {
        const d = await db.driver.create({ data: { ...dd, status: 'active', organizationId: org2.id } });
        org2DriverIds.push(d.id);
      }
      results.org2Drivers = org2DriverIds.length;

      // Link vehicles to drivers
      for (let i = 0; i < org2Vehicles.length; i++) {
        await db.vehicle.update({ where: { id: org2Vehicles[i] }, data: { driverId: org2DriverIds[i % org2DriverIds.length] } });
      }

      // Devices for org2
      const org2Devices: string[] = [];
      for (let i = 0; i < 5; i++) {
        const imei = `86773004000200${i + 1}`;
        const device = await db.device.create({
          data: {
            imei, model: i < 3 ? 'FMB920' : 'GT06N', manufacturer: i < 3 ? 'Teltonika' : 'Concox',
            deviceType: 'GPS Tracker', protocol: i < 3 ? 'FMB' : 'GT06',
            serialNumber: `SN-${imei.slice(-6)}`, firmware: 'v3.2.1',
            organizationId: org2.id, status: 'installed',
            purchaseDate: new Date(2024, 11, 20), purchaseCost: 380,
            installDate: new Date(2025, 2, 15),
            warrantyExpiry: new Date(2027, 2, 15),
            lastPingAt: new Date(Date.now() - Math.random() * 600000),
            batteryLevel: Math.floor(Math.random() * 20 + 80),
          },
        });
        org2Devices.push(device.id);
        await db.vehicle.update({ where: { id: org2Vehicles[i] }, data: { deviceId: device.id } });
      }
      results.org2Devices = org2Devices.length;

      // Trips for org2 (last 30 days, 4-6 per vehicle)
      const org2Routes = [
        { from: 'Sharjah Port', to: 'Dubai DIP', baseDist: 38, baseDur: 50 },
        { from: 'SAIF Zone', to: 'JAFZA', baseDist: 32, baseDur: 42 },
        { from: 'Al Sajaa', to: 'Ras Al Khaimah', baseDist: 95, baseDur: 80 },
        { from: 'Sharjah Industrial', to: 'Ajman Free Zone', baseDist: 22, baseDur: 30 },
        { from: 'Hamriya Port', to: 'Dubai Airport', baseDist: 40, baseDur: 48 },
      ];

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const org2TripRecords: any[] = [];
      for (let vIdx = 0; vIdx < org2Vehicles.length; vIdx++) {
        const driverName = org2DriverData[vIdx % org2DriverData.length].name;
        const numTrips = 4 + Math.floor(Math.random() * 3);
        for (let t = 0; t < numTrips; t++) {
          const route = org2Routes[(vIdx + t) % org2Routes.length];
          const daysAgo = Math.floor(Math.random() * 30);
          const startHour = 6 + Math.floor(Math.random() * 12);
          const startTime = new Date(now);
          startTime.setDate(startTime.getDate() - daysAgo);
          startTime.setHours(startHour, Math.floor(Math.random() * 60), 0, 0);
          const duration = route.baseDur + Math.floor((Math.random() - 0.5) * 16);
          const distance = route.baseDist + Math.round((Math.random() - 0.5) * 8);
          const isCompleted = daysAgo > 0;
          org2TripRecords.push({
            vehicleId: org2Vehicles[vIdx], organizationId: org2.id, driverName,
            startTime, endTime: isCompleted ? new Date(startTime.getTime() + duration * 60000) : null,
            distance, duration: isCompleted ? duration : null,
            maxSpeed: 75 + Math.floor(Math.random() * 45),
            avgSpeed: Math.round((distance / duration) * 60),
            idleTime: Math.floor(duration * 0.1 + Math.random() * 8),
            overspeedCount: Math.floor(Math.random() * 4),
            harshBrakes: Math.floor(Math.random() * 3),
            harshAccel: Math.floor(Math.random() * 2),
            status: isCompleted ? 'completed' : 'in_progress',
          });
        }
      }
      for (let i = 0; i < org2TripRecords.length; i += BATCH_SIZE) {
        await db.trip.createMany({ data: org2TripRecords.slice(i, i + BATCH_SIZE) });
      }
      results.org2Trips = org2TripRecords.length;

      // Maintenance for org2
      const org2MaintRecords: Prisma.MaintenanceRecordCreateManyInput[] = [];
      const org2MaintTypes = ['oil_change', 'tire_rotation', 'brake_service', 'general_service'];
      for (let i = 0; i < org2Vehicles.length; i++) {
        const type = org2MaintTypes[i % org2MaintTypes.length];
        const completedDate = new Date(now);
        completedDate.setDate(completedDate.getDate() - 20 - i * 10);
        org2MaintRecords.push({
          vehicleId: org2Vehicles[i], organizationId: org2.id, type,
          description: `Routine ${type.replace('_', ' ')} for fleet vehicle`,
          triggerType: 'mileage', triggerValue: 15000,
          scheduledDate: new Date(completedDate.getTime() - 3 * 86400000),
          completedDate, cost: 350 + i * 100, status: 'completed',
        });
        // One upcoming
        org2MaintRecords.push({
          vehicleId: org2Vehicles[i], organizationId: org2.id,
          type: org2MaintTypes[(i + 2) % org2MaintTypes.length],
          description: `Scheduled ${org2MaintTypes[(i + 2) % org2MaintTypes.length].replace('_', ' ')}`,
          triggerType: 'time', triggerValue: 30,
          scheduledDate: new Date(now.getTime() + (15 + i * 5) * 86400000),
          cost: 400, status: 'upcoming',
        });
      }
      for (let i = 0; i < org2MaintRecords.length; i += BATCH_SIZE) {
        await db.maintenanceRecord.createMany({ data: org2MaintRecords.slice(i, i + BATCH_SIZE) });
      }
      results.org2Maintenance = org2MaintRecords.length;

      // Geofences for org2
      const org2Geofences = [
        { name: 'Sharjah Port Zone', centerLat: 25.352, centerLng: 55.365, radius: 2000 },
        { name: 'SAIF Zone Sharjah', centerLat: 25.322, centerLng: 55.415, radius: 1200 },
      ];
      for (const g of org2Geofences) {
        await db.geofence.create({ data: { name: g.name, type: 'circle', centerLat: g.centerLat, centerLng: g.centerLng, radius: g.radius, organizationId: org2.id } });
      }
      results.org2Geofences = org2Geofences.length;

      // Alerts for org2
      const org2Alerts = [
        { type: 'overspeed', severity: 'high', vehicleIdx: 0, driverName: org2DriverData[0].name, message: 'Speed exceeded 125 km/h on Emirates Road', status: 'open', daysAgo: 0 },
        { type: 'device_offline', severity: 'medium', vehicleIdx: 3, driverName: null, message: 'HiAce device offline for 20 min', status: 'acknowledged', daysAgo: 1 },
        { type: 'geofence_exit', severity: 'medium', vehicleIdx: 1, driverName: org2DriverData[1].name, message: 'Vehicle exited SAIF Zone boundary', status: 'resolved', daysAgo: 3 },
      ];
      for (const a of org2Alerts) {
        const createdAt = new Date(now);
        createdAt.setDate(createdAt.getDate() - a.daysAgo);
        await db.alert.create({
          data: {
            type: a.type, severity: a.severity,
            vehicleId: org2Vehicles[a.vehicleIdx], driverName: a.driverName,
            vehiclePlate: org2VehicleData[a.vehicleIdx].plateNumber,
            message: a.message, status: a.status,
            organizationId: org2.id, createdAt,
            resolvedAt: a.status === 'resolved' ? new Date(createdAt.getTime() + 3600000) : null,
          },
        });
      }
      results.org2Alerts = org2Alerts.length;

      // Invoices for org2
      for (let m = 5; m >= 0; m--) {
        const createdAt = new Date(now.getFullYear(), now.getMonth() - m, 1);
        const dueDate = new Date(createdAt); dueDate.setDate(dueDate.getDate() + 30);
        const amount = 750;
        await db.invoice.create({
          data: {
            invoiceNumber: `GEC-2026-${String(6 - m).padStart(3, '0')}`,
            organizationId: org2.id,
            amount, tax: Math.round(amount * 0.05), total: Math.round(amount * 1.05),
            status: m > 0 ? 'paid' : 'pending',
            dueDate,
            paidAt: m > 0 ? new Date(createdAt.getTime() + 20 * 86400000) : null,
            notes: 'Monthly fleet tracking subscription',
          },
        });
      }
      results.org2Invoices = 6;

      // Notifications for org2
      const org2Notifs = [
        { type: 'alert', title: 'Speed Alert', body: 'SHJ-A-11111 exceeded speed limit', userId: org2Admin.id, daysAgo: 0 },
        { type: 'system', title: 'Invoice Generated', body: 'Monthly invoice GEC-2026-006 generated', userId: org2Admin.id, daysAgo: 1 },
        { type: 'maintenance', title: 'Maintenance Due', body: 'SHJ-B-33333 maintenance scheduled next week', userId: org2Mgr.id, daysAgo: 2 },
      ];
      for (const n of org2Notifs) {
        const createdAt = new Date(now); createdAt.setDate(createdAt.getDate() - n.daysAgo);
        await db.notification.create({
          data: { userId: n.userId, organizationId: org2.id, type: n.type, title: n.title, body: n.body, read: n.daysAgo > 1, createdAt },
        });
      }
      results.org2Notifications = org2Notifs.length;

      // Contacts for org2
      const org2Contacts = [
        { name: 'Hamad Al Shamsi', email: 'hamad@shamsilogistics.ae', phone: '+971506667777', position: 'Owner' },
        { name: 'Noor Fatima', email: 'noor@speedyfreight.ae', phone: '+971507778888', position: 'Operations Manager' },
      ];
      for (const c of org2Contacts) {
        await db.contact.create({ data: { ...c, organizationId: org2.id } });
      }
      results.org2Contacts = org2Contacts.length;

      // ========== 23. THIRD ORGANIZATION — Emirates Cargo Solutions ==========
      const org3 = await db.organization.create({
        data: {
          name: 'Emirates Cargo Solutions',
          tradeName: 'Emirates Cargo',
          email: 'ops@emiratescargo.ae',
          phone: '+971502290456',
          emirate: 'Abu Dhabi',
          city: 'Abu Dhabi',
          country: 'AE',
          address: 'Mussafah Industrial Area, Abu Dhabi, UAE',
          currency: 'AED',
          status: 'active',
        },
      });
      results.org3 = org3.name;

      const plan3 = await db.plan.findFirst({ where: { name: 'Pro' } }) || await db.plan.create({
        data: { name: 'Pro', vehicleLimit: 25, priceMonthly: 99, description: 'Advanced analytics, unlimited alerts, API access', active: true },
      });

      await db.subscription.create({
        data: { organizationId: org3.id, planId: plan3.id, status: 'active', startsAt: new Date(), endsAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), vehicleCount: 3 },
      });

      const org3Password = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
      const org3Admin = await db.user.create({
        data: { email: 'admin@emiratescargo.ae', passwordHash: await hashPassword(org3Password), name: 'Sara Al Qasimi', phone: '+971502290456', role: 'org_owner', organizationId: org3.id, status: 'active', emailVerified: true },
      });
      results.org3Admin = { email: org3Admin.email, generatedPassword: org3Password };

      // Branch
      await db.branch.create({
        data: { name: 'Abu Dhabi HQ', address: 'Mussafah M38, Abu Dhabi', emirate: 'Abu Dhabi', phone: '+971255556666', organizationId: org3.id },
      });

      // Vehicles
      const org3VehicleData = [
        { plateNumber: 'AUH-T-10001', vehicleType: 'Heavy Truck', make: 'Volvo', model: 'FH 500', year: 2025, mileage: 8900, color: 'Red' },
        { plateNumber: 'AUH-T-10002', vehicleType: 'Heavy Truck', make: 'Scania', model: 'R450', year: 2024, mileage: 45300, color: 'White' },
        { plateNumber: 'AUH-V-10003', vehicleType: 'Van', make: 'Mercedes', model: 'Sprinter', year: 2025, mileage: 5600, color: 'Silver' },
      ];
      const org3VehicleIds: string[] = [];
      for (const vd of org3VehicleData) {
        const v = await db.vehicle.create({ data: { ...vd, status: 'active', organizationId: org3.id, installDate: new Date(2025, 5, 1) } });
        org3VehicleIds.push(v.id);
      }
      results.org3Vehicles = org3VehicleIds.length;

      // Drivers
      const org3Drivers = [
        { name: 'Khalid Obaid', phone: '+971501112222', nationality: 'Emirati', licenseType: 'Heavy', licenseExpiry: new Date(2029, 0, 1), score: 95, totalDistance: 23400, totalViolations: 0, totalTrips: 67 },
        { name: 'Mohammed Rashid', phone: '+971502223333', nationality: 'Sudanese', licenseType: 'Heavy', licenseExpiry: new Date(2028, 3, 1), score: 71, totalDistance: 89700, totalViolations: 14, totalTrips: 245 },
      ];
      const org3DriverIds: string[] = [];
      for (const dd of org3Drivers) {
        const d = await db.driver.create({ data: { ...dd, status: 'active', organizationId: org3.id } });
        org3DriverIds.push(d.id);
      }
      // Link
      for (let i = 0; i < org3VehicleIds.length; i++) {
        await db.vehicle.update({ where: { id: org3VehicleIds[i] }, data: { driverId: org3DriverIds[i % org3DriverIds.length] } });
      }
      results.org3Drivers = org3DriverIds.length;

      // Devices
      for (let i = 0; i < 3; i++) {
        const imei = `86773004000300${i + 1}`;
        const device = await db.device.create({
          data: {
            imei, model: 'FMB920', manufacturer: 'Teltonika', deviceType: 'GPS Tracker', protocol: 'FMB',
            serialNumber: `SN-${imei.slice(-6)}`, firmware: 'v3.3.0',
            organizationId: org3.id, status: 'installed',
            purchaseDate: new Date(2025, 4, 1), purchaseCost: 420,
            installDate: new Date(2025, 5, 1),
            warrantyExpiry: new Date(2027, 5, 1),
            lastPingAt: new Date(Date.now() - Math.random() * 300000),
            batteryLevel: Math.floor(Math.random() * 15 + 85),
          },
        });
        await db.vehicle.update({ where: { id: org3VehicleIds[i] }, data: { deviceId: device.id } });
      }

      // Geofences
      await db.geofence.create({ data: { name: 'Mussafah Industrial Zone', type: 'circle', centerLat: 24.353, centerLng: 54.487, radius: 3000, organizationId: org3.id } });
      await db.geofence.create({ data: { name: 'Khalifa Port Area', type: 'circle', centerLat: 24.853, centerLng: 54.661, radius: 2500, organizationId: org3.id } });

      // Trips for org3
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const org3TripRecords: any[] = [];
      const org3Routes = [
        { from: 'Mussafah', to: 'Khalifa Port', baseDist: 42, baseDur: 55 },
        { from: 'Abu Dhabi Airport', to: 'Dubai', baseDist: 130, baseDur: 100 },
        { from: 'ICAD', to: 'Jebel Ali', baseDist: 120, baseDur: 90 },
      ];
      for (let vIdx = 0; vIdx < org3VehicleIds.length; vIdx++) {
        const driverName = org3Drivers[vIdx % org3Drivers.length].name;
        const numTrips = 3 + Math.floor(Math.random() * 3);
        for (let t = 0; t < numTrips; t++) {
          const route = org3Routes[(vIdx + t) % org3Routes.length];
          const daysAgo = Math.floor(Math.random() * 20);
          const startHour = 5 + Math.floor(Math.random() * 14);
          const startTime = new Date(now); startTime.setDate(startTime.getDate() - daysAgo); startTime.setHours(startHour, Math.floor(Math.random() * 60), 0, 0);
          const duration = route.baseDur + Math.floor((Math.random() - 0.5) * 20);
          const distance = route.baseDist + Math.round((Math.random() - 0.5) * 10);
          const isCompleted = daysAgo > 0;
          org3TripRecords.push({
            vehicleId: org3VehicleIds[vIdx], organizationId: org3.id, driverName,
            startTime, endTime: isCompleted ? new Date(startTime.getTime() + duration * 60000) : null,
            distance, duration: isCompleted ? duration : null,
            maxSpeed: 80 + Math.floor(Math.random() * 40),
            avgSpeed: Math.round((distance / duration) * 60),
            idleTime: Math.floor(duration * 0.08 + Math.random() * 6),
            overspeedCount: Math.floor(Math.random() * 2),
            harshBrakes: Math.floor(Math.random() * 2),
            harshAccel: Math.floor(Math.random() * 1),
            status: isCompleted ? 'completed' : 'in_progress',
          });
        }
      }
      for (let i = 0; i < org3TripRecords.length; i += BATCH_SIZE) {
        await db.trip.createMany({ data: org3TripRecords.slice(i, i + BATCH_SIZE) });
      }
      results.org3Trips = org3TripRecords.length;

      // Invoice for org3
      const createdAt = new Date(now.getFullYear(), now.getMonth(), 1);
      const dueDate = new Date(createdAt); dueDate.setDate(dueDate.getDate() + 30);
      await db.invoice.create({
        data: {
          invoiceNumber: 'ECS-2026-001', organizationId: org3.id,
          amount: 297, tax: Math.round(297 * 0.05), total: Math.round(297 * 1.05),
          status: 'pending', dueDate, notes: 'First month Pro subscription',
        },
      });
      results.org3Invoices = 1;

      // Alert rules for org3
      await db.alertRule.create({ data: { name: 'Speed Alert', type: 'overspeed', conditions: JSON.stringify({ threshold: 100, unit: 'km/h' }), channels: 'in_app', active: true, organizationId: org3.id } });
      await db.alertRule.create({ data: { name: 'Device Offline', type: 'device_offline', conditions: JSON.stringify({ timeout: 20, unit: 'min' }), channels: 'in_app,sms', active: true, organizationId: org3.id } });
    }

    logger.info('Demo data seeded successfully', results);

    return NextResponse.json({
      message: 'Demo data seeded successfully',
      seeded: true,
      schemaSync: schemaSyncResult,
      results,
    });
  } catch (error) {
    logger.error('Demo seed error', { error });
    return NextResponse.json(
      { error: 'Demo seed failed', details: String(error) },
      { status: 500 }
    );
  }
}

// Also allow GET for easy browser-based setup (requires auth)
export async function GET(request: Request) {
  return POST(request);
}