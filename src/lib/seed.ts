/**
 * RTR 360 — Database Seed Script
 * Populates the database with realistic UAE demo data.
 * Run with: bun run src/lib/seed.ts
 */

import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

async function main() {
  console.log('🌱 Seeding RTR 360 database...');
  console.log('='.repeat(50));

  // Clean up existing data (order matters for FK constraints)
  console.log('🧹 Cleaning existing data...');
  await db.alert.deleteMany();
  await db.ticket.deleteMany();
  await db.trip.deleteMany();
  await db.maintenanceRecord.deleteMany();
  await db.installation.deleteMany();
  await db.technician.deleteMany();
  await db.notification.deleteMany();
  await db.document.deleteMany();
  await db.quotation.deleteMany();
  await db.invoice.deleteMany();
  await db.subscription.deleteMany();
  await db.activity.deleteMany();
  await db.opportunity.deleteMany();
  await db.lead.deleteMany();
  await db.contact.deleteMany();
  await db.vehicle.deleteMany();
  await db.driver.deleteMany();
  await db.device.deleteMany();
  await db.sIM.deleteMany();
  await db.geofence.deleteMany();
  await db.alertRule.deleteMany();
  await db.contract.deleteMany();
  await db.branch.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.plan.deleteMany();
  await db.organization.deleteMany();
  await db.setting.deleteMany();

  console.log('✅ Database cleaned');

  // ========================================
  // 1. ORGANIZATIONS
  // ========================================
  console.log('\n🏢 Creating organizations...');

  const rtrOrg = await db.organization.create({
    data: {
      name: 'RTR Platform',
      tradeName: 'RTR',
      legalName: 'RTR Technology Solutions LLC',
      industry: 'Technology',
      email: 'info@rtr.ae',
      phone: '+971-4-123-4567',
      website: 'https://rtr.ae',
      emirate: 'Dubai',
      address: 'Dubai Internet City, Building 12',
      city: 'Dubai',
      status: 'active',
      planName: 'Enterprise',
      vehicleLimit: 9999,
      userLimit: 999,
    },
  });
  console.log(`  ✅ RTR Platform (${rtrOrg.id})`);

  const customerOrg = await db.organization.create({
    data: {
      name: 'Al Fahim Logistics',
      tradeName: 'Al Fahim',
      legalName: 'Al Fahim Logistics Co. LLC',
      industry: 'Logistics & Transportation',
      email: 'info@alfahim.ae',
      phone: '+971-2-678-9012',
      website: 'https://alfahim.ae',
      emirate: 'Abu Dhabi',
      address: 'Khalifa Industrial Zone (KIZAD)',
      city: 'Abu Dhabi',
      status: 'active',
      planName: 'Premium',
      vehicleLimit: 50,
      userLimit: 20,
    },
  });
  console.log(`  ✅ Al Fahim Logistics (${customerOrg.id})`);

  // Phase 2: Additional customer orgs for pipeline demo
  const megaOrg = await db.organization.create({
    data: {
      name: 'Mega Logistics FZCO',
      tradeName: 'Mega Logistics',
      legalName: 'Mega Logistics FZCO',
      industry: 'Logistics & Transportation',
      email: 'info@megalogistics.ae',
      phone: '+971-4-888-9900',
      emirate: 'Dubai',
      address: 'JAFZA South, Building 45',
      city: 'Dubai',
      status: 'active',
      planName: 'Starter',
      vehicleLimit: 10,
      userLimit: 5,
    },
  });
  console.log(`  ✅ Mega Logistics FZCO (${megaOrg.id})`);

  // Phase 9: Additional orgs for Super Admin demo
  const gulfTransitOrg = await db.organization.create({
    data: {
      name: 'Gulf Transit LLC',
      tradeName: 'Gulf Transit',
      legalName: 'Gulf Transit LLC',
      industry: 'Transportation',
      email: 'ops@gulftransit.ae',
      phone: '+971-6-555-1234',
      emirate: 'Sharjah',
      address: 'SAIF Zone, Sharjah',
      city: 'Sharjah',
      status: 'active',
      planName: 'Starter',
      vehicleLimit: 15,
      userLimit: 5,
    },
  });
  console.log(`  ✅ Gulf Transit LLC (${gulfTransitOrg.id})`);

  const emiratesFleetOrg = await db.organization.create({
    data: {
      name: 'Emirates Fleet Services',
      tradeName: 'Emirates Fleet',
      legalName: 'Emirates Fleet Services LLC',
      industry: 'Fleet Management',
      email: 'info@emiratesfleet.ae',
      phone: '+971-3-777-8899',
      emirate: 'Ajman',
      address: 'Ajman Free Zone',
      city: 'Ajman',
      status: 'active',
      planName: 'Premium',
      vehicleLimit: 30,
      userLimit: 10,
      whiteLabelEnabled: true,
      primaryColor: '#1e40af',
      brandedAppName: 'FleetTrack Pro',
    },
  });
  console.log(`  ✅ Emirates Fleet Services (${emiratesFleetOrg.id})`);

  const nationalCargoOrg = await db.organization.create({
    data: {
      name: 'National Cargo Co.',
      tradeName: 'National Cargo',
      legalName: 'National Cargo Company LLC',
      industry: 'Cargo & Logistics',
      email: 'info@nationalcargo.ae',
      phone: '+971-7-222-3344',
      emirate: 'Ras Al Khaimah',
      address: 'RAK Free Trade Zone',
      city: 'Ras Al Khaimah',
      status: 'active',
      planName: 'Free',
      vehicleLimit: 5,
      userLimit: 3,
    },
  });
  console.log(`  ✅ National Cargo Co. (${nationalCargoOrg.id})`);

  const adnocOrg = await db.organization.create({
    data: {
      name: 'ADNOC Distribution',
      tradeName: 'ADNOC Dist',
      legalName: 'ADNOC Distribution LLC',
      industry: 'Oil & Gas',
      email: 'fleet@adnocdist.ae',
      phone: '+971-2-666-7788',
      emirate: 'Abu Dhabi',
      address: 'ADNOC HQ, Corniche Road',
      city: 'Abu Dhabi',
      status: 'active',
      planName: 'Enterprise',
      vehicleLimit: 200,
      userLimit: 50,
      whiteLabelEnabled: true,
      primaryColor: '#dc2626',
      accentColor: '#fbbf24',
      brandedAppName: 'ADNOC Fleet Command',
    },
  });
  console.log(`  ✅ ADNOC Distribution (${adnocOrg.id})`);

  const inactiveOrg = await db.organization.create({
    data: {
      name: 'Desert Express (Inactive)',
      tradeName: 'Desert Express',
      industry: 'Courier',
      email: 'info@desertexpress.ae',
      emirate: 'Fujairah',
      status: 'inactive',
      planName: 'Free',
      vehicleLimit: 5,
      userLimit: 2,
    },
  });
  console.log(`  ✅ Desert Express (Inactive) (${inactiveOrg.id})`);

  // ========================================
  // 2. USERS
  // ========================================
  console.log('\n👤 Creating users...');

  // Password from env var or a strong default (dev only)
  const SEED_PASSWORD = process.env.SEED_PASSWORD || 'REDACTED_SEED_PASSWORD';

  const adminPw = await hashPassword(SEED_PASSWORD);
  const superAdmin = await db.user.create({
    data: {
      email: 'admin@rtr.ae',
      passwordHash: adminPw,
      name: 'RTR Super Admin',
      phone: '+971-50-111-2233',
      role: 'super_admin',
      // No organizationId — super admin sees all orgs
      status: 'active',
      emailVerified: true,
    },
  });
  console.log(`  ✅ Super Admin: admin@rtr.ae`);

  const opsPw = await hashPassword(SEED_PASSWORD);
  const opsManager = await db.user.create({
    data: {
      email: 'ahmed.ops@rtr.ae',
      passwordHash: opsPw,
      name: 'Ahmed Al Mansouri',
      phone: '+971-50-444-5566',
      role: 'operations_manager',
      organizationId: rtrOrg.id,
      status: 'active',
      emailVerified: true,
    },
  });
  console.log(`  ✅ Operations Manager: ahmed.ops@rtr.ae`);

  const salesPw = await hashPassword(SEED_PASSWORD);
  const salesManager = await db.user.create({
    data: {
      email: 'fatima.sales@rtr.ae',
      passwordHash: salesPw,
      name: 'Fatima Al Hashemi',
      phone: '+971-50-777-8899',
      role: 'sales_manager',
      organizationId: rtrOrg.id,
      status: 'active',
      emailVerified: true,
    },
  });
  console.log(`  ✅ Sales Manager: fatima.sales@rtr.ae`);

  // Customer org user
  const customerPw = await hashPassword(SEED_PASSWORD);
  const customerUser = await db.user.create({
    data: {
      email: 'khalid@alfahim.ae',
      passwordHash: customerPw,
      name: 'Khalid Al Fahim',
      phone: '+971-50-333-4455',
      role: 'org_owner',
      organizationId: customerOrg.id,
      status: 'active',
      emailVerified: true,
    },
  });
  console.log(`  ✅ Customer Admin: khalid@alfahim.ae`);

  // ========================================
  // 3. BRANCHES (for customer org)
  // ========================================
  console.log('\n🏠 Creating branches...');

  const branchAbuDhabi = await db.branch.create({
    data: {
      name: 'Abu Dhabi HQ',
      address: 'Khalifa Industrial Zone (KIZAD)',
      emirate: 'Abu Dhabi',
      phone: '+971-2-678-9012',
      organizationId: customerOrg.id,
    },
  });
  console.log(`  ✅ Abu Dhabi HQ`);

  const branchDubai = await db.branch.create({
    data: {
      name: 'Dubai Branch',
      address: 'Jebel Ali Free Zone (JAFZA)',
      emirate: 'Dubai',
      phone: '+971-4-555-6677',
      organizationId: customerOrg.id,
    },
  });
  console.log(`  ✅ Dubai Branch`);

  // ========================================
  // 4. DEVICES
  // ========================================
  console.log('\n📱 Creating devices...');

  const devices = await Promise.all([
    db.device.create({
      data: {
        imei: '860123456789012',
        serialNumber: 'RTR-DEV-001',
        model: 'GT06N',
        manufacturer: 'Concox',
        phoneNumber: '+971-56-100-0001',
        firmware: 'v3.2.1',
        organizationId: customerOrg.id,
        warehouse: 'JAFZA Warehouse',
        status: 'installed',
      },
    }),
    db.device.create({
      data: {
        imei: '860123456789013',
        serialNumber: 'RTR-DEV-002',
        model: 'GT06N',
        manufacturer: 'Concox',
        phoneNumber: '+971-56-100-0002',
        firmware: 'v3.2.1',
        organizationId: customerOrg.id,
        warehouse: 'JAFZA Warehouse',
        status: 'installed',
      },
    }),
    db.device.create({
      data: {
        imei: '860123456789014',
        serialNumber: 'RTR-DEV-003',
        model: 'FM1200',
        manufacturer: 'Teltonika',
        phoneNumber: '+971-56-100-0003',
        firmware: 'v2.8.0',
        organizationId: customerOrg.id,
        warehouse: 'JAFZA Warehouse',
        status: 'warehouse',
      },
    }),
  ]);
  console.log(`  ✅ Created ${devices.length} devices`);

  // Add warehouse devices (for RTR platform - unassigned inventory)
  const warehouseDevices = await Promise.all([
    db.device.create({
      data: {
        imei: '860987654321001', serialNumber: 'RTR-WH-001', model: 'GT06N', manufacturer: 'Concox',
        deviceType: 'GPS Tracker', protocol: 'GT06', warehouse: 'RTR Dubai Warehouse',
        status: 'warehouse', purchaseCost: 185, purchaseDate: new Date('2025-06-01'),
      },
    }),
    db.device.create({
      data: {
        imei: '860987654321002', serialNumber: 'RTR-WH-002', model: 'GT06N', manufacturer: 'Concox',
        deviceType: 'GPS Tracker', protocol: 'GT06', warehouse: 'RTR Dubai Warehouse',
        status: 'warehouse', purchaseCost: 185, purchaseDate: new Date('2025-06-01'),
      },
    }),
    db.device.create({
      data: {
        imei: '860987654321003', serialNumber: 'RTR-WH-003', model: 'FM1200', manufacturer: 'Teltonika',
        deviceType: 'Wired Tracker', protocol: 'FM', warehouse: 'RTR Dubai Warehouse',
        status: 'warehouse', purchaseCost: 220, purchaseDate: new Date('2025-06-15'),
      },
    }),
    db.device.create({
      data: {
        imei: '860987654321004', serialNumber: 'RTR-WH-004', model: 'S10', manufacturer: 'Queclink',
        deviceType: 'OBD Tracker', protocol: 'Queclink', warehouse: 'RTR Abu Dhabi Warehouse',
        status: 'warehouse', purchaseCost: 150, purchaseDate: new Date('2025-07-01'),
      },
    }),
    db.device.create({
      data: {
        imei: '860987654321005', serialNumber: 'RTR-WH-005', model: 'GT06N', manufacturer: 'Concox',
        deviceType: 'GPS Tracker', protocol: 'GT06', warehouse: 'RTR Dubai Warehouse',
        status: 'defective', purchaseCost: 185, purchaseDate: new Date('2025-03-10'),
      },
    }),
  ]);
  console.log(`  ✅ Created ${warehouseDevices.length} warehouse devices`);

  // ========================================
  // 4B. TECHNICIANS
  // ========================================
  console.log('\n🔧 Creating technicians...');

  const technicians = await Promise.all([
    db.technician.create({
      data: {
        name: 'Hassan Ali Khan', phone: '+971-55-100-2233', email: 'hassan.tech@rtr.ae',
        emirate: 'Dubai', specialty: 'GPS Installation', organizationId: rtrOrg.id,
        status: 'active', totalInstalled: 47,
      },
    }),
    db.technician.create({
      data: {
        name: 'Waqar Ahmed', phone: '+971-55-200-3344', email: 'waqar.tech@rtr.ae',
        emirate: 'Dubai', specialty: 'All Types', organizationId: rtrOrg.id,
        status: 'active', totalInstalled: 32,
      },
    }),
    db.technician.create({
      data: {
        name: 'Bilal Sheikh', phone: '+971-55-300-4455',
        emirate: 'Abu Dhabi', specialty: 'Camera Setup', organizationId: rtrOrg.id,
        status: 'active', totalInstalled: 18,
      },
    }),
  ]);
  console.log(`  ✅ Created ${technicians.length} technicians`);

  // ========================================
  // 5. DRIVERS
  // ========================================
  console.log('\n🚗 Creating drivers...');

  const drivers = await Promise.all([
    db.driver.create({
      data: {
        name: 'Mohammed Al Rashid',
        employeeId: 'DRV-001',
        phone: '+971-50-222-3344',
        email: 'mohammed.drv@alfahim.ae',
        licenseNumber: 'DL-87654',
        licenseType: 'Heavy Vehicle',
        licenseExpiry: new Date('2026-06-15'),
        emirate: 'Dubai',
        nationality: 'UAE',
        emergencyContact: 'Ali Al Rashid',
        emergencyPhone: '+971-50-222-9900',
        organizationId: customerOrg.id,
        status: 'active',
        score: 95.5,
        totalTrips: 142,
        totalDistance: 28500.0,
        totalViolations: 2,
      },
    }),
    db.driver.create({
      data: {
        name: 'Rashid Sultan',
        employeeId: 'DRV-002',
        phone: '+971-50-333-4455',
        email: 'rashid.drv@alfahim.ae',
        licenseNumber: 'DL-54321',
        licenseType: 'Heavy Vehicle',
        licenseExpiry: new Date('2025-12-01'),
        emirate: 'Dubai',
        nationality: 'India',
        organizationId: customerOrg.id,
        status: 'active',
        score: 88.0,
        totalTrips: 98,
        totalDistance: 19200.0,
        totalViolations: 5,
      },
    }),
    db.driver.create({
      data: {
        name: 'Saeed Al Maktoum',
        employeeId: 'DRV-003',
        phone: '+971-50-444-5566',
        licenseNumber: 'DL-11223',
        licenseType: 'Light Vehicle',
        licenseExpiry: new Date('2026-09-30'),
        emirate: 'Abu Dhabi',
        nationality: 'UAE',
        organizationId: customerOrg.id,
        status: 'active',
        score: 97.2,
        totalTrips: 210,
        totalDistance: 42000.0,
        totalViolations: 0,
      },
    }),
  ]);
  console.log(`  ✅ Created ${drivers.length} drivers`);

  // ========================================
  // 6. VEHICLES
  // ========================================
  console.log('\n🚛 Creating vehicles...');

  const vehicleData = [
    {
      internalId: 'VH-001',
      plateNumber: 'DXB-A-12345',
      make: 'Toyota',
      model: 'Hilux',
      year: 2023,
      vehicleType: 'pickup',
      color: 'White',
      branchId: branchDubai.id,
      driverId: drivers[0].id,
      deviceId: devices[0].id,
      status: 'active',
      mileage: 15200.0,
      installDate: new Date('2024-01-15'),
    },
    {
      internalId: 'VH-002',
      plateNumber: 'AUH-B-67890',
      make: 'Nissan',
      model: 'Patrol',
      year: 2022,
      vehicleType: 'suv',
      color: 'Black',
      branchId: branchAbuDhabi.id,
      driverId: drivers[1].id,
      deviceId: devices[1].id,
      status: 'active',
      mileage: 28300.0,
      installDate: new Date('2024-02-20'),
    },
    {
      internalId: 'VH-003',
      plateNumber: 'SHJ-C-11223',
      make: 'Isuzu',
      model: 'NPR',
      year: 2023,
      vehicleType: 'truck',
      color: 'White',
      branchId: branchDubai.id,
      driverId: drivers[2].id,
      status: 'active',
      mileage: 45600.0,
      installDate: new Date('2024-03-10'),
    },
    {
      internalId: 'VH-004',
      plateNumber: 'DXB-D-44556',
      make: 'Mitsubishi',
      model: 'Canter',
      year: 2021,
      vehicleType: 'truck',
      color: 'Silver',
      branchId: branchDubai.id,
      status: 'maintenance',
      mileage: 67800.0,
      installDate: new Date('2023-08-05'),
    },
    {
      internalId: 'VH-005',
      plateNumber: 'AJM-E-77889',
      make: 'Toyota',
      model: 'Land Cruiser',
      year: 2024,
      vehicleType: 'suv',
      color: 'Pearl White',
      branchId: branchAbuDhabi.id,
      status: 'active',
      mileage: 3200.0,
      installDate: new Date('2024-06-01'),
    },
  ];

  const vehicles = await Promise.all(
    vehicleData.map((v) =>
      db.vehicle.create({
        data: {
          ...v,
          organizationId: customerOrg.id,
          warrantyExpiry: new Date(v.year + 3, 0, 1),
        },
      })
    )
  );
  console.log(`  ✅ Created ${vehicles.length} vehicles`);

  // ========================================
  // 6B. INSTALLATIONS
  // ========================================
  console.log('\n🔧 Creating installations...');

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 5);

  const installations = await Promise.all([
    db.installation.create({
      data: {
        installationNumber: 'INST-202508-001',
        organizationId: customerOrg.id,
        vehicleId: vehicles[0].id,
        deviceId: devices[0].id,
        technicianId: technicians[0].id,
        status: 'completed',
        scheduledDate: new Date('2024-01-14'),
        scheduledTime: '09:00',
        completedAt: new Date('2024-01-15'),
        emirate: 'Dubai',
        location: 'Al Quoz Industrial Area, Unit 45',
        gpsSignal: true, powerWiring: true, antennaMounted: true,
        testResult: 'passed',
        notes: 'Standard installation, GPS signal strong.',
      },
    }),
    db.installation.create({
      data: {
        installationNumber: 'INST-202508-002',
        organizationId: customerOrg.id,
        vehicleId: vehicles[1].id,
        deviceId: devices[1].id,
        technicianId: technicians[1].id,
        status: 'completed',
        scheduledDate: new Date('2024-02-19'),
        scheduledTime: '10:30',
        completedAt: new Date('2024-02-20'),
        emirate: 'Abu Dhabi',
        location: 'Mussafah Industrial, Block 12',
        gpsSignal: true, powerWiring: true, antennaMounted: true,
        testResult: 'passed',
      },
    }),
    db.installation.create({
      data: {
        installationNumber: 'INST-202508-003',
        organizationId: customerOrg.id,
        vehicleId: vehicles[4].id,
        deviceId: warehouseDevices[0].id,
        technicianId: technicians[0].id,
        status: 'scheduled',
        scheduledDate: tomorrow,
        scheduledTime: '08:00',
        emirate: 'Dubai',
        location: 'Customer site - Al Jaddaf',
        notes: 'New vehicle delivery, customer requested morning slot.',
      },
    }),
    db.installation.create({
      data: {
        installationNumber: 'INST-202508-004',
        organizationId: customerOrg.id,
        vehicleId: vehicles[3].id,
        deviceId: warehouseDevices[1].id,
        technicianId: technicians[2].id,
        status: 'in_progress',
        scheduledDate: new Date(),
        scheduledTime: '14:00',
        emirate: 'Dubai',
        location: 'RTR Workshop - Al Quoz',
        notes: 'Maintenance vehicle re-install after repair.',
      },
    }),
  ]);
  console.log(`  ✅ Created ${installations.length} installations`);

  // ========================================
  // 7. ALERTS
  // ========================================
  console.log('\n⚠️  Creating alerts...');

  const alertData = [
    {
      type: 'speeding',
      severity: 'high',
      vehicleId: vehicles[0].id,
      driverName: drivers[0].name,
      vehiclePlate: vehicles[0].plateNumber,
      message: 'Speed exceeded 140 km/h on Sheikh Zayed Road',
      status: 'open',
    },
    {
      type: 'geofence_exit',
      severity: 'medium',
      vehicleId: vehicles[1].id,
      driverName: drivers[1].name,
      vehiclePlate: vehicles[1].plateNumber,
      message: 'Vehicle exited Abu Dhabi city geofence boundary',
      status: 'open',
    },
    {
      type: 'idle',
      severity: 'low',
      vehicleId: vehicles[2].id,
      driverName: drivers[2].name,
      vehiclePlate: vehicles[2].plateNumber,
      message: 'Vehicle idling for more than 30 minutes at KIZAD',
      status: 'resolved',
      resolvedAt: new Date('2024-07-10T14:30:00Z'),
    },
    {
      type: 'fuel_drop',
      severity: 'high',
      vehicleId: vehicles[1].id,
      driverName: drivers[1].name,
      vehiclePlate: vehicles[1].plateNumber,
      message: 'Sudden fuel drop detected — possible theft or leak',
      status: 'open',
    },
    {
      type: 'maintenance_due',
      severity: 'medium',
      vehicleId: vehicles[3].id,
      vehiclePlate: vehicles[3].plateNumber,
      message: 'Scheduled maintenance overdue by 2,000 km',
      status: 'open',
    },
  ];

  const alerts = await Promise.all(
    alertData.map((a) =>
      db.alert.create({
        data: { ...a, organizationId: customerOrg.id },
      })
    )
  );
  console.log(`  ✅ Created ${alerts.length} alerts`);

  // ========================================
  // 8. LEADS
  // ========================================
  console.log('\n📋 Creating leads...');

  const leadsData = [
    {
      name: 'Omar Al Ketbi',
      email: 'omar@emiratescargo.ae',
      phone: '+971-50-600-1122',
      company: 'Emirates Cargo Services',
      emirate: 'Dubai',
      vehicleCount: 25,
      vehicleType: 'truck',
      requirement: 'Full fleet GPS tracking with driver behavior monitoring',
      source: 'website',
      campaign: 'Google Ads UAE',
      status: 'new',
      priority: 'high',
      assignedToId: salesManager.id,
    },
    {
      name: 'Aisha Al Qasimi',
      email: 'aisha@gulftransport.ae',
      phone: '+971-50-700-2233',
      company: 'Gulf Transport LLC',
      emirate: 'Sharjah',
      vehicleCount: 10,
      vehicleType: 'van',
      requirement: 'Temperature monitoring for refrigerated fleet',
      source: 'referral',
      status: 'contacted',
      priority: 'medium',
      assignedToId: salesManager.id,
    },
    {
      name: 'Hamad Al Nahyan',
      email: 'hamad@abudhabilogistics.ae',
      phone: '+971-50-800-3344',
      company: 'Abu Dhabi Logistics Co.',
      emirate: 'Abu Dhabi',
      vehicleCount: 50,
      vehicleType: 'truck',
      requirement: 'Enterprise fleet management with API integration',
      source: 'exhibition',
      campaign: 'GITEX Technology Week',
      status: 'qualified',
      priority: 'high',
      assignedToId: salesManager.id,
    },
    {
      name: 'Mariam Al Muhairi',
      email: 'mariam@swiftcourier.ae',
      phone: '+971-50-900-4455',
      company: 'Swift Courier Services',
      emirate: 'Dubai',
      vehicleCount: 8,
      vehicleType: 'motorcycle',
      requirement: 'Real-time tracking for last-mile delivery fleet',
      source: 'website',
      status: 'proposal',
      priority: 'medium',
      assignedToId: salesManager.id,
    },
    {
      name: 'Sultan Al Suwaidi',
      email: 'sultan@desertexpress.ae',
      phone: '+971-50-111-5566',
      company: 'Desert Express Transport',
      emirate: 'Ras Al Khaimah',
      vehicleCount: 15,
      vehicleType: 'truck',
      requirement: 'Heavy vehicle tracking with fuel management',
      source: 'cold_call',
      status: 'new',
      priority: 'low',
      assignedToId: salesManager.id,
    },
    {
      name: 'Latifa Al Shamsi',
      email: 'latifa@royaltrans.ae',
      phone: '+971-50-222-6677',
      company: 'Royal Transportation',
      emirate: 'Dubai',
      vehicleCount: 30,
      vehicleType: 'bus',
      requirement: 'School bus tracking with parent notification system',
      source: 'referral',
      status: 'negotiation',
      priority: 'high',
      assignedToId: salesManager.id,
    },
    {
      name: 'Khalifa Al Dhaheri',
      email: 'khalifa@northernfleet.ae',
      phone: '+971-50-333-7788',
      company: 'Northern Fleet Services',
      emirate: 'Fujairah',
      vehicleCount: 12,
      vehicleType: 'pickup',
      requirement: 'Basic GPS tracking with monthly reports',
      source: 'website',
      campaign: 'Facebook Ads UAE',
      status: 'new',
      priority: 'medium',
      assignedToId: salesManager.id,
    },
    {
      name: 'Noora Al Ketbi',
      email: 'noora@greenfleet.ae',
      phone: '+971-50-444-8899',
      company: 'Green Fleet Solutions',
      emirate: 'Dubai',
      vehicleCount: 20,
      vehicleType: 'ev',
      requirement: 'EV fleet monitoring with battery analytics',
      source: 'exhibition',
      campaign: 'WETEX Dubai',
      status: 'contacted',
      priority: 'medium',
      assignedToId: salesManager.id,
    },
    {
      name: 'Ahmed Al Zaabi',
      email: 'ahmed@citymove.ae',
      phone: '+971-50-555-9900',
      company: 'City Move Movers',
      emirate: 'Ajman',
      vehicleCount: 6,
      vehicleType: 'truck',
      requirement: 'Moving company fleet tracking with route optimization',
      source: 'cold_call',
      status: 'lost',
      priority: 'low',
      notes: 'Chose competitor — pricing too high',
      assignedToId: salesManager.id,
    },
    {
      name: 'Rashed Al Ameri',
      email: 'rashed@megalogistics.ae',
      phone: '+971-50-666-0011',
      company: 'Mega Logistics FZCO',
      emirate: 'Dubai',
      vehicleCount: 100,
      vehicleType: 'truck',
      requirement: 'Enterprise platform with custom integrations and SLA',
      source: 'website',
      campaign: 'SEO Organic',
      status: 'won',
      priority: 'urgent',
      assignedToId: salesManager.id,
    },
  ];

  const leads = await Promise.all(
    leadsData.map((l) =>
      db.lead.create({
        data: { ...l, organizationId: rtrOrg.id },
      })
    )
  );
  console.log(`  ✅ Created ${leads.length} leads`);

  // ========================================
  // 9. PLANS
  // ========================================
  console.log('\n💰 Creating plans...');

  const basicPlan = await db.plan.create({
    data: {
      name: 'Basic',
      description: 'Essential fleet tracking for small operations',
      priceMonthly: 50,
      priceAnnual: 500,
      vehicleLimit: 10,
      features: JSON.stringify([
        'Real-time GPS tracking',
        'Basic reporting',
        'Email alerts',
        'Mobile app access',
      ]),
      active: true,
    },
  });
  console.log(`  ✅ Basic Plan (50 AED/mo)`);

  const premiumPlan = await db.plan.create({
    data: {
      name: 'Premium',
      description: 'Advanced fleet management for growing businesses',
      priceMonthly: 120,
      priceAnnual: 1200,
      vehicleLimit: 0, // unlimited
      features: JSON.stringify([
        'Real-time GPS tracking',
        'Advanced analytics & reports',
        'Driver behavior monitoring',
        'Geofencing',
        'Fuel management',
        'Maintenance scheduling',
        'API access',
        'Priority support',
        'Custom dashboards',
      ]),
      active: true,
    },
  });
  console.log(`  ✅ Premium Plan (120 AED/mo)`);

  // ========================================
  // 10. SUBSCRIPTION for customer org
  // ========================================
  console.log('\n📝 Creating subscription...');

  await db.subscription.create({
    data: {
      organizationId: customerOrg.id,
      planId: premiumPlan.id,
      status: 'active',
      vehicleCount: 5,
      startsAt: new Date('2024-01-01'),
      endsAt: new Date('2025-01-01'),
    },
  });
  console.log(`  ✅ Al Fahim Logistics → Premium Plan`);

  // ========================================
  // 11. TICKETS
  // ========================================
  console.log('\n🎫 Creating tickets...');

  await Promise.all([
    db.ticket.create({
      data: {
        ticketNumber: 'TKT-0001',
        organizationId: customerOrg.id,
        subject: 'GPS signal lost on VH-002',
        description: 'Vehicle AUH-B-67890 showing no GPS signal since yesterday afternoon',
        priority: 'high',
        status: 'open',
        vehiclePlate: 'AUH-B-67890',
        assignedToId: opsManager.id,
      },
    }),
    db.ticket.create({
      data: {
        ticketNumber: 'TKT-0002',
        organizationId: customerOrg.id,
        subject: 'Request additional device for new vehicle',
        description: 'Need a new tracking device for incoming Toyota Land Cruiser',
        priority: 'medium',
        status: 'open',
      },
    }),
  ]);
  console.log(`  ✅ Created 2 tickets`);

  // ========================================
  // 12. TRIPS (today)
  // ========================================
  console.log('\n🗺️  Creating trips...');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await Promise.all([
    db.trip.create({
      data: {
        vehicleId: vehicles[0].id,
        driverName: drivers[0].name,
        startTime: new Date(today.getTime() + 6 * 60 * 60 * 1000),
        endTime: new Date(today.getTime() + 9 * 60 * 60 * 1000),
        distance: 145.5,
        duration: 180,
        maxSpeed: 120.0,
        avgSpeed: 48.5,
        idleTime: 15,
        overspeedCount: 2,
        harshBrakes: 1,
        harshAccel: 0,
        status: 'completed',
      },
    }),
    db.trip.create({
      data: {
        vehicleId: vehicles[1].id,
        driverName: drivers[1].name,
        startTime: new Date(today.getTime() + 7 * 60 * 60 * 1000),
        distance: 230.0,
        duration: 210,
        maxSpeed: 135.0,
        avgSpeed: 65.7,
        idleTime: 22,
        overspeedCount: 4,
        harshBrakes: 3,
        harshAccel: 2,
        status: 'in_progress',
      },
    }),
    db.trip.create({
      data: {
        vehicleId: vehicles[2].id,
        driverName: drivers[2].name,
        startTime: new Date(today.getTime() + 5 * 60 * 60 * 1000),
        endTime: new Date(today.getTime() + 11 * 60 * 60 * 1000),
        distance: 380.0,
        duration: 360,
        maxSpeed: 110.0,
        avgSpeed: 63.3,
        idleTime: 8,
        overspeedCount: 0,
        harshBrakes: 0,
        harshAccel: 1,
        status: 'completed',
      },
    }),
  ]);
  console.log(`  ✅ Created 3 trips for today`);

  // ========================================
  // 13. GEOFENCES
  // ========================================
  console.log('\n📍 Creating geofences...');

  await Promise.all([
    db.geofence.create({
      data: {
        name: 'Abu Dhabi City Zone',
        type: 'circle',
        centerLat: 24.4539,
        centerLng: 54.3773,
        radius: 25000,
        organizationId: customerOrg.id,
      },
    }),
    db.geofence.create({
      data: {
        name: 'KIZAD Depot',
        type: 'circle',
        centerLat: 24.5236,
        centerLng: 54.6733,
        radius: 2000,
        organizationId: customerOrg.id,
      },
    }),
  ]);
  console.log(`  ✅ Created 2 geofences`);

  // ========================================
  // 14. CONTACTS (Phase 2)
  // ========================================
  console.log('\n👤 Creating contacts...');

  await Promise.all([
    db.contact.create({
      data: {
        name: 'Omar Al Ketbi',
        email: 'omar@emiratescargo.ae',
        phone: '+971-50-600-1122',
        position: 'Fleet Manager',
        organizationId: rtrOrg.id,
      },
    }),
    db.contact.create({
      data: {
        name: 'Hamad Al Nahyan',
        email: 'hamad@abudhabilogistics.ae',
        phone: '+971-50-800-3344',
        position: 'Operations Director',
        organizationId: rtrOrg.id,
      },
    }),
    db.contact.create({
      data: {
        name: 'Rashed Al Ameri',
        email: 'rashed@megalogistics.ae',
        phone: '+971-50-666-0011',
        position: 'CEO',
        organizationId: rtrOrg.id,
      },
    }),
    db.contact.create({
      data: {
        name: 'Khalid Al Fahim',
        email: 'khalid@alfahim.ae',
        phone: '+971-50-333-4455',
        position: 'Managing Director',
        organizationId: customerOrg.id,
      },
    }),
  ]);
  console.log(`  ✅ Created 4 contacts`);

  // ========================================
  // 15. ACTIVITIES (Phase 2)
  // ========================================
  console.log('\n📝 Creating activities...');

  await Promise.all([
    db.activity.create({
      data: {
        type: 'call',
        title: 'Initial discovery call',
        description: 'Discussed fleet size and requirements. Very interested in premium plan.',
        leadId: leads[0].id,
        userId: salesManager.id,
      },
    }),
    db.activity.create({
      data: {
        type: 'email',
        title: 'Sent proposal via email',
        description: 'Sent detailed proposal with pricing for 25 GPS devices + premium plan.',
        leadId: leads[0].id,
        userId: salesManager.id,
      },
    }),
    db.activity.create({
      data: {
        type: 'whatsapp',
        title: 'Follow-up on WhatsApp',
        description: 'Sent product brochure and demo video link.',
        leadId: leads[1].id,
        userId: salesManager.id,
      },
    }),
    db.activity.create({
      data: {
        type: 'meeting',
        title: 'On-site meeting at KIZAD',
        description: 'Met with operations team. Demoed live tracking dashboard. Very positive response.',
        leadId: leads[2].id,
        userId: salesManager.id,
      },
    }),
    db.activity.create({
      data: {
        type: 'note',
        title: 'Contract signed!',
        description: '100-vehicle enterprise deal closed. Installation starts next week.',
        leadId: leads[9].id,
        userId: salesManager.id,
      },
    }),
    db.activity.create({
      data: {
        type: 'call',
        title: 'Requirement gathering call',
        description: 'Discussed temperature monitoring needs for refrigerated vans.',
        leadId: leads[1].id,
        userId: salesManager.id,
      },
    }),
  ]);
  console.log(`  ✅ Created 6 activities`);

  // ========================================
  // 16. QUOTATIONS (Phase 2)
  // ========================================
  console.log('\n💰 Creating quotations...');

  const q1Items = [
    { description: 'GPS Tracking Device (GT06N)', quantity: 25, unitPrice: 150 },
    { description: 'SIM Card (Annual Plan)', quantity: 25, unitPrice: 120 },
    { description: 'Professional Installation', quantity: 25, unitPrice: 100 },
    { description: 'Premium Plan — Monthly Fee (x12)', quantity: 12, unitPrice: 1250 },
  ];
  const q1Subtotal = 25 * 150 + 25 * 120 + 25 * 100 + 12 * 1250;
  const q1Tax = Math.round(q1Subtotal * 5 / 100 * 100) / 100;

  await db.quotation.create({
    data: {
      quotationNumber: 'RTR-Q-2408-0001',
      leadId: leads[0].id,
      organizationId: rtrOrg.id,
      items: { create: q1Items.map((item: Record<string, unknown>, i: number) => ({ sortOrder: i, description: item.description as string, quantity: item.quantity as number, unitPrice: item.unitPrice as number })) },
      subtotal: q1Subtotal,
      taxRate: 5,
      tax: q1Tax,
      total: q1Subtotal + q1Tax,
      status: 'sent',
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      notes: 'Volume discount applied for 25+ devices. Includes free training session.',
      terms: 'This quotation is valid for 30 days. Payment terms: 50% advance, 50% upon installation. All prices in AED.',
    },
  });

  const q2Items = [
    { description: 'GPS Tracking Device (FM1200)', quantity: 100, unitPrice: 180 },
    { description: 'SIM Card (Annual Plan)', quantity: 100, unitPrice: 100 },
    { description: 'Professional Installation', quantity: 100, unitPrice: 80 },
    { description: 'Premium Plan — Monthly Fee (x12)', quantity: 12, unitPrice: 5000 },
    { description: 'Custom API Integration', quantity: 1, unitPrice: 15000 },
    { description: 'Dedicated Account Manager', quantity: 12, unitPrice: 2000 },
  ];
  const q2Subtotal = 100 * 180 + 100 * 100 + 100 * 80 + 12 * 5000 + 15000 + 12 * 2000;
  const q2Tax = Math.round(q2Subtotal * 5 / 100 * 100) / 100;

  await db.quotation.create({
    data: {
      quotationNumber: 'RTR-Q-2407-0002',
      leadId: leads[9].id,
      organizationId: rtrOrg.id,
      items: { create: q2Items.map((item: Record<string, unknown>, i: number) => ({ sortOrder: i, description: item.description as string, quantity: item.quantity as number, unitPrice: item.unitPrice as number })) },
      subtotal: q2Subtotal,
      taxRate: 5,
      tax: q2Tax,
      total: q2Subtotal + q2Tax,
      status: 'accepted',
      validUntil: new Date('2024-08-15'),
      notes: 'Enterprise SLA with 99.9% uptime guarantee. Dedicated support channel included.',
      terms: 'This quotation is valid for 30 days. Payment terms: 30% advance, 40% at half-installation, 30% upon completion. All prices in AED.',
    },
  });

  const q3Items = [
    { description: 'GPS Tracking Device (GT06N)', quantity: 10, unitPrice: 150 },
    { description: 'Temperature Sensor', quantity: 10, unitPrice: 75 },
    { description: 'SIM Card (Annual Plan)', quantity: 10, unitPrice: 120 },
    { description: 'Professional Installation', quantity: 10, unitPrice: 100 },
    { description: 'Premium Plan — Monthly Fee (x12)', quantity: 12, unitPrice: 500 },
  ];
  const q3Subtotal = 10 * 150 + 10 * 75 + 10 * 120 + 10 * 100 + 12 * 500;
  const q3Tax = Math.round(q3Subtotal * 5 / 100 * 100) / 100;

  await db.quotation.create({
    data: {
      quotationNumber: 'RTR-Q-2408-0003',
      leadId: leads[1].id,
      organizationId: rtrOrg.id,
      items: { create: q3Items.map((item: Record<string, unknown>, i: number) => ({ sortOrder: i, description: item.description as string, quantity: item.quantity as number, unitPrice: item.unitPrice as number })) },
      subtotal: q3Subtotal,
      taxRate: 5,
      tax: q3Tax,
      total: q3Subtotal + q3Tax,
      status: 'draft',
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      notes: 'Specialized quote for cold chain monitoring. Temperature sensors included.',
      terms: 'This quotation is valid for 30 days. Payment terms: 50% advance, 50% upon installation. All prices in AED.',
    },
  });

  console.log(`  ✅ Created 3 quotations`);

  // ========================================
  // 17. MAINTENANCE RECORDS (Phase 5)
  // ========================================
  console.log('\n🔧 Creating maintenance records...');

  // Get the vehicles for maintenance records
  const allVehicles = await db.vehicle.findMany({ where: { organizationId: customerOrg.id } });

  await Promise.all([
    db.maintenanceRecord.create({
      data: {
        vehicleId: allVehicles[0]?.id || '',
        type: 'oil_change',
        description: 'Regular oil change with synthetic 5W-30. Filter replaced.',
        triggerType: 'mileage',
        triggerValue: 10000,
        scheduledDate: new Date('2025-07-15'),
        completedDate: new Date('2025-07-16'),
        cost: 450,
        status: 'completed',
        organizationId: customerOrg.id,
      },
    }),
    db.maintenanceRecord.create({
      data: {
        vehicleId: allVehicles[1]?.id || '',
        type: 'tire_rotation',
        description: 'Full tire rotation and wheel alignment check.',
        triggerType: 'mileage',
        triggerValue: 20000,
        scheduledDate: new Date('2025-08-20'),
        cost: 350,
        status: 'upcoming',
        organizationId: customerOrg.id,
      },
    }),
    db.maintenanceRecord.create({
      data: {
        vehicleId: allVehicles[2]?.id || '',
        type: 'brake_service',
        description: 'Front and rear brake pad replacement. Brake fluid flush.',
        triggerType: 'manual',
        scheduledDate: new Date('2025-08-05'),
        completedDate: new Date('2025-08-06'),
        cost: 1200,
        status: 'completed',
        organizationId: customerOrg.id,
      },
    }),
    db.maintenanceRecord.create({
      data: {
        vehicleId: allVehicles[0]?.id || '',
        type: 'ac_service',
        description: 'AC compressor service and gas refill for UAE summer.',
        triggerType: 'date',
        scheduledDate: new Date('2025-06-01'),
        cost: 800,
        status: 'scheduled',
        organizationId: customerOrg.id,
      },
    }),
    db.maintenanceRecord.create({
      data: {
        vehicleId: allVehicles[3]?.id || '',
        type: 'general_service',
        description: '30,000 km full service. All fluids, filters, and belts checked.',
        triggerType: 'mileage',
        triggerValue: 30000,
        scheduledDate: new Date('2025-09-10'),
        cost: 2500,
        status: 'upcoming',
        organizationId: customerOrg.id,
      },
    }),
    db.maintenanceRecord.create({
      data: {
        vehicleId: allVehicles[4]?.id || '',
        type: 'inspection',
        description: 'Annual vehicle inspection for registration renewal.',
        triggerType: 'date',
        scheduledDate: new Date('2025-08-01'),
        completedDate: new Date('2025-08-01'),
        cost: 500,
        status: 'completed',
        organizationId: customerOrg.id,
      },
    }),
  ]);
  console.log('  ✅ Created 6 maintenance records');

  // ========================================
  // 18. SUBSCRIPTIONS & INVOICES (Phase 5)
  // ========================================
  console.log('\n💳 Creating subscriptions & invoices...');

  // Create subscription for customer org
  const premiumPlanRef = premiumPlan; // Already defined above

  if (premiumPlanRef) {
    const custSubscription = await db.subscription.upsert({
      where: { organizationId: customerOrg.id },
      update: { planId: premiumPlanRef.id, vehicleCount: 5, status: 'active', startsAt: new Date('2025-01-01'), endsAt: new Date('2025-12-31') },
      create: {
        organizationId: customerOrg.id,
        planId: premiumPlanRef.id,
        status: 'active',
        vehicleCount: 5,
        startsAt: new Date('2025-01-01'),
        endsAt: new Date('2025-12-31'),
      },
    });

    // Create invoices for this subscription
    await Promise.all([
      db.invoice.create({
        data: {
          invoiceNumber: 'INV-20250101-001',
          organizationId: customerOrg.id,
          subscriptionId: custSubscription.id,
          amount: 6250,
          tax: 312.5,
          total: 6562.5,
          status: 'paid',
          dueDate: new Date('2025-01-15'),
          paidAt: new Date('2025-01-10'),
          notes: 'January 2025 — Premium Plan (5 vehicles)',
        },
      }),
      db.invoice.create({
        data: {
          invoiceNumber: 'INV-20250201-001',
          organizationId: customerOrg.id,
          subscriptionId: custSubscription.id,
          amount: 6250,
          tax: 312.5,
          total: 6562.5,
          status: 'paid',
          dueDate: new Date('2025-02-15'),
          paidAt: new Date('2025-02-12'),
          notes: 'February 2025 — Premium Plan (5 vehicles)',
        },
      }),
      db.invoice.create({
        data: {
          invoiceNumber: 'INV-20250701-001',
          organizationId: customerOrg.id,
          subscriptionId: custSubscription.id,
          amount: 6250,
          tax: 312.5,
          total: 6562.5,
          status: 'pending',
          dueDate: new Date('2025-07-15'),
          notes: 'July 2025 — Premium Plan (5 vehicles)',
        },
      }),
      db.invoice.create({
        data: {
          invoiceNumber: 'INV-20250801-001',
          organizationId: customerOrg.id,
          subscriptionId: custSubscription.id,
          amount: 6250,
          tax: 312.5,
          total: 6562.5,
          status: 'pending',
          dueDate: new Date('2025-08-15'),
          notes: 'August 2025 — Premium Plan (5 vehicles)',
        },
      }),
    ]);
    console.log('  ✅ Created 1 subscription + 4 invoices');
  } else {
    console.log('  ⚠️ Plans not found, skipping subscription seed');
  }

  // ========================================
  // 19. SUPPORT TICKETS (Phase 5)
  // ========================================
  console.log('\n🎫 Creating support tickets...');

  await Promise.all([
    db.ticket.create({
      data: {
        ticketNumber: 'TKT-20250810-001',
        organizationId: customerOrg.id,
        subject: 'GPS device offline — DXB-A-12345',
        description: 'Vehicle DXB-A-12345 GPS tracker has not reported since yesterday afternoon. Last known location was near Al Quoz industrial area. Please check device connectivity.',
        priority: 'high',
        status: 'in_progress',
        vehiclePlate: 'DXB-A-12345',
        createdAt: new Date('2025-08-10T09:30:00'),
      },
    }),
    db.ticket.create({
      data: {
        ticketNumber: 'TKT-20250811-001',
        organizationId: customerOrg.id,
        subject: 'Request for additional 10 tracking devices',
        description: 'We are expanding our fleet by 10 vehicles next month. Please prepare a quotation for GPS devices, SIM cards, and installation for the new vehicles.',
        priority: 'medium',
        status: 'open',
        createdAt: new Date('2025-08-11T14:15:00'),
      },
    }),
    db.ticket.create({
      data: {
        ticketNumber: 'TKT-20250812-001',
        organizationId: customerOrg.id,
        subject: 'Geofence alert not triggering for Jebel Ali warehouse',
        description: 'Configured a geofence around our Jebel Ali warehouse but exit alerts are not being triggered. Vehicles leave the area without any notification.',
        priority: 'medium',
        status: 'open',
        vehiclePlate: 'DXB-C-67890',
        createdAt: new Date('2025-08-12T10:00:00'),
      },
    }),
    db.ticket.create({
      data: {
        ticketNumber: 'TKT-20250813-001',
        organizationId: customerOrg.id,
        subject: 'Driver app login issue for Mohammed Al Rashid',
        description: 'Driver Mohammed Al Rashid (DRV-001) is unable to login to the driver mobile app. Reset password did not resolve the issue.',
        priority: 'low',
        status: 'resolved',
        resolvedAt: new Date('2025-08-13T16:00:00'),
        createdAt: new Date('2025-08-13T11:00:00'),
      },
    }),
    db.ticket.create({
      data: {
        ticketNumber: 'TKT-20250814-001',
        organizationId: rtrOrg.id,
        subject: 'Monthly invoice discrepancy — July billing',
        description: 'The July invoice shows 5 vehicles but we only have 4 active devices. One device was removed in mid-June. Please correct the billing amount.',
        priority: 'urgent',
        status: 'open',
        createdAt: new Date('2025-08-14T08:45:00'),
      },
    }),
  ]);
  console.log('  ✅ Created 5 support tickets');

  // ========================================
  // 21. ALERT RULES (Phase 6)
  // ========================================
  console.log('\n🔔 Creating alert rules...');

  await Promise.all([
    db.alertRule.create({
      data: { name: 'Speed Limit — 120 km/h', type: 'overspeed', conditions: JSON.stringify({ threshold: 120, unit: 'km/h' }), channels: JSON.stringify(['in_app', 'email']), active: true, organizationId: customerOrg.id },
    }),
    db.alertRule.create({
      data: { name: 'Jebel Ali Warehouse Exit', type: 'geofence_exit', conditions: JSON.stringify({ geofenceId: 'jebel-ali-wh' }), channels: JSON.stringify(['in_app', 'sms', 'whatsapp']), active: true, organizationId: customerOrg.id },
    }),
    db.alertRule.create({
      data: { name: 'SOS Emergency', type: 'sos', conditions: null, channels: JSON.stringify(['in_app', 'email', 'sms', 'whatsapp']), active: true, organizationId: customerOrg.id },
    }),
    db.alertRule.create({
      data: { name: 'Device Power Off Alert', type: 'power_off', conditions: null, channels: JSON.stringify(['in_app', 'email']), active: true, organizationId: customerOrg.id },
    }),
    db.alertRule.create({
      data: { name: 'Idle More Than 30 Minutes', type: 'idle', conditions: JSON.stringify({ timeoutMinutes: 30 }), channels: JSON.stringify(['in_app']), active: false, organizationId: customerOrg.id },
    }),
    db.alertRule.create({
      data: { name: 'KIZAD Yard Geofence Enter', type: 'geofence_enter', conditions: JSON.stringify({ geofenceId: 'kizad-yard' }), channels: JSON.stringify(['in_app', 'whatsapp']), active: true, organizationId: customerOrg.id },
    }),
    db.alertRule.create({
      data: { name: 'Low Battery Warning', type: 'low_battery', conditions: JSON.stringify({ threshold: 15 }), channels: JSON.stringify(['in_app', 'email']), active: true, organizationId: rtrOrg.id },
    }),
  ]);
  console.log('  ✅ Created 7 alert rules');

  // ========================================
  // 22. GEOFENCES (Phase 6)
  // ========================================
  console.log('\n📍 Creating geofences...');

  await Promise.all([
    db.geofence.create({
      data: { name: 'Jebel Ali Warehouse', type: 'circle', centerLat: 25.0225, centerLng: 55.0704, radius: 500, organizationId: customerOrg.id },
    }),
    db.geofence.create({
      data: { name: 'KIZAD Yard', type: 'circle', centerLat: 24.5384, centerLng: 54.6726, radius: 1000, organizationId: customerOrg.id },
    }),
    db.geofence.create({
      data: { name: 'Dubai Port (Jebel Ali Port)', type: 'circle', centerLat: 24.9894, centerLng: 55.0455, radius: 2000, organizationId: customerOrg.id },
    }),
    db.geofence.create({
      data: { name: 'Mussafah Industrial Area', type: 'circle', centerLat: 24.3523, centerLng: 54.4876, radius: 1500, organizationId: customerOrg.id },
    }),
  ]);
  console.log('  ✅ Created 4 geofences');

  // ========================================
  // 23. CONTRACTS (Phase 6)
  // ========================================
  console.log('\n📄 Creating contracts...');

  await Promise.all([
    db.contract.create({
      data: { title: 'Fleet GPS Tracking Service Agreement — Al Fahim', startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31'), status: 'active', terms: 'Annual service agreement for GPS tracking of 5 vehicles. Includes 24/7 monitoring, monthly reports, and priority support. SLA: 99.5% uptime. Payment: Monthly AED 6,562.50 (inclusive of 5% VAT).', organizationId: customerOrg.id },
    }),
    db.contract.create({
      data: { title: 'Device Supply Agreement — Concox GT06N', startDate: new Date('2025-03-01'), endDate: new Date('2026-02-28'), status: 'active', terms: 'Bulk supply agreement for Concox GT06N GPS devices. Minimum order quantity: 50 units. Unit price: AED 150. Delivery within 5 business days. Warranty: 12 months from delivery date.', organizationId: rtrOrg.id },
    }),
    db.contract.create({
      data: { title: 'Etisalat SIM Bulk Agreement', startDate: new Date('2025-01-01'), endDate: new Date('2025-12-31'), status: 'active', terms: 'Annual data-only SIM plan for GPS devices. 500MB/month per SIM. Annual cost: AED 100/SIM. Includes 100 SMS/month. Auto-renewal clause.', organizationId: rtrOrg.id },
    }),
  ]);
  console.log('  ✅ Created 3 contracts');

  // ========================================
  // 24. ADDITIONAL TRIPS (Phase 6)
  // ========================================
  console.log('\n🚛 Creating trip history...');

  const tripVehicles = await db.vehicle.findMany({ where: { organizationId: customerOrg.id } });
  const tripDrivers = await db.driver.findMany({ where: { organizationId: customerOrg.id } });

  await Promise.all([
    // Completed trips
    db.trip.create({
      data: { vehicleId: tripVehicles[0]?.id || '', driverName: tripDrivers[0]?.name, startTime: new Date('2025-08-14T06:00:00'), endTime: new Date('2025-08-14T09:30:00'), distance: 245.5, duration: 12600, maxSpeed: 118, avgSpeed: 72, idleTime: 1800, overspeedCount: 2, harshBrakes: 1, harshAccel: 3, status: 'completed' },
    }),
    db.trip.create({
      data: { vehicleId: tripVehicles[1]?.id || '', driverName: tripDrivers[1]?.name, startTime: new Date('2025-08-14T07:15:00'), endTime: new Date('2025-08-14T11:00:00'), distance: 312.8, duration: 14100, maxSpeed: 125, avgSpeed: 68, idleTime: 2400, overspeedCount: 5, harshBrakes: 3, harshAccel: 2, status: 'completed' },
    }),
    db.trip.create({
      data: { vehicleId: tripVehicles[2]?.id || '', driverName: tripDrivers[2]?.name, startTime: new Date('2025-08-13T05:30:00'), endTime: new Date('2025-08-13T08:45:00'), distance: 198.2, duration: 11700, maxSpeed: 105, avgSpeed: 65, idleTime: 900, overspeedCount: 0, harshBrakes: 0, harshAccel: 1, status: 'completed' },
    }),
    db.trip.create({
      data: { vehicleId: tripVehicles[0]?.id || '', driverName: tripDrivers[0]?.name, startTime: new Date('2025-08-13T10:00:00'), endTime: new Date('2025-08-13T14:30:00'), distance: 356.7, duration: 16200, maxSpeed: 132, avgSpeed: 78, idleTime: 3600, overspeedCount: 8, harshBrakes: 4, harshAccel: 6, status: 'completed' },
    }),
    db.trip.create({
      data: { vehicleId: tripVehicles[3]?.id || '', driverName: tripDrivers[1]?.name, startTime: new Date('2025-08-12T06:00:00'), endTime: new Date('2025-08-12T10:00:00'), distance: 287.3, duration: 14400, maxSpeed: 110, avgSpeed: 70, idleTime: 1200, overspeedCount: 1, harshBrakes: 1, harshAccel: 2, status: 'completed' },
    }),
    // In-progress trip
    db.trip.create({
      data: { vehicleId: tripVehicles[4]?.id || '', driverName: tripDrivers[0]?.name, startTime: new Date('2025-08-15T06:30:00'), distance: 45.2, duration: 2700, maxSpeed: 95, avgSpeed: 62, idleTime: 300, overspeedCount: 0, harshBrakes: 0, harshAccel: 1, status: 'in_progress' },
    }),
  ]);
  console.log('  ✅ Created 6 trips');

  // ========================================
  // 25. NOTIFICATIONS (Phase 6)
  // ========================================
  console.log('\n🔔 Creating notifications...');

  await Promise.all([
    db.notification.create({ data: { organizationId: customerOrg.id, type: 'alert', title: 'Overspeed Alert', body: 'Vehicle DXB-A-12345 exceeded 120 km/h on Sheikh Zayed Road near Dubai Marina.', read: false, createdAt: new Date(Date.now() - 1000 * 60 * 15) } }),
    db.notification.create({ data: { organizationId: customerOrg.id, type: 'ticket', title: 'New Support Ticket', body: 'Ticket TKT-20250811-001 has been assigned to your organization.', read: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3) } }),
    db.notification.create({ data: { organizationId: customerOrg.id, type: 'maintenance', title: 'Maintenance Due Tomorrow', body: 'Vehicle DXB-B-54321 is due for tire rotation. Scheduled for Aug 20.', read: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 8) } }),
    db.notification.create({ data: { organizationId: customerOrg.id, type: 'invoice', title: 'Invoice Generated', body: 'Invoice INV-20250801-001 for AED 6,562.50 is now available. Due: Aug 15.', read: true, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48) } }),
    db.notification.create({ data: { organizationId: rtrOrg.id, type: 'system', title: 'New Lead Assigned', body: 'Lead "Al Futtaim Logistics" from Google Ads has been assigned to Fatima.', read: false, createdAt: new Date(Date.now() - 1000 * 60 * 30) } }),
    db.notification.create({ data: { organizationId: rtrOrg.id, type: 'info', title: 'Installation Completed', body: 'Installation INST-202508-004 has been completed by Hassan Ali Khan.', read: true, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24) } }),
    db.notification.create({ data: { organizationId: customerOrg.id, type: 'alert', title: 'Geofence Exit Alert', body: 'Vehicle DXB-C-67890 exited Jebel Ali Warehouse geofence at 14:32.', read: true, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 36) } }),
    db.notification.create({ data: { organizationId: rtrOrg.id, type: 'system', title: 'Platform Update', body: 'RTR 360 v2.5 deployed with new Reports & Analytics module.', read: false, createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72) } }),
  ]);
  console.log('  ✅ Created 8 notifications');

  // ========================================
  // 26. PLATFORM SETTINGS (Phase 5)
  // ========================================
  console.log('\n⚙️ Creating platform settings...');

  await Promise.all([
    db.setting.upsert({ where: { key: 'org_name' }, update: { value: 'RTR 360' }, create: { key: 'org_name', value: 'RTR 360' } }),
    db.setting.upsert({ where: { key: 'org_email' }, update: { value: 'info@rtr.ae' }, create: { key: 'org_email', value: 'info@rtr.ae' } }),
    db.setting.upsert({ where: { key: 'org_phone' }, update: { value: '+971-4-123-4567' }, create: { key: 'org_phone', value: '+971-4-123-4567' } }),
    db.setting.upsert({ where: { key: 'org_website' }, update: { value: 'https://rtr360.ae' }, create: { key: 'org_website', value: 'https://rtr360.ae' } }),
    db.setting.upsert({ where: { key: 'org_address' }, update: { value: 'Office 1205, Aspect Tower, Business Bay, Dubai, UAE' }, create: { key: 'org_address', value: 'Office 1205, Aspect Tower, Business Bay, Dubai, UAE' } }),
    db.setting.upsert({ where: { key: 'org_emirate' }, update: { value: 'Dubai' }, create: { key: 'org_emirate', value: 'Dubai' } }),
    db.setting.upsert({ where: { key: 'notify_email' }, update: { value: 'true' }, create: { key: 'notify_email', value: 'true' } }),
    db.setting.upsert({ where: { key: 'notify_sms' }, update: { value: 'false' }, create: { key: 'notify_sms', value: 'false' } }),
    db.setting.upsert({ where: { key: 'notify_whatsapp' }, update: { value: 'true' }, create: { key: 'notify_whatsapp', value: 'true' } }),
    db.setting.upsert({ where: { key: 'alert_overspeed' }, update: { value: 'true' }, create: { key: 'alert_overspeed', value: 'true' } }),
    db.setting.upsert({ where: { key: 'alert_geofence' }, update: { value: 'true' }, create: { key: 'alert_geofence', value: 'true' } }),
    db.setting.upsert({ where: { key: 'alert_sos' }, update: { value: 'true' }, create: { key: 'alert_sos', value: 'true' } }),
    db.setting.upsert({ where: { key: 'gps_update_interval' }, update: { value: '30' }, create: { key: 'gps_update_interval', value: '30' } }),
    db.setting.upsert({ where: { key: 'gps_idle_timeout' }, update: { value: '300' }, create: { key: 'gps_idle_timeout', value: '300' } }),
    db.setting.upsert({ where: { key: 'gps_speed_threshold' }, update: { value: '120' }, create: { key: 'gps_speed_threshold', value: '120' } }),
  ]);
  console.log('  ✅ Created 15 platform settings');

  console.log('\n' + '='.repeat(50));
  console.log('🎉 Seed completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`   Organizations: 7`);
  console.log(`   Users: 4`);
  console.log(`   Vehicles: 5`);
  console.log(`   Drivers: 3`);
  console.log(`   Devices: 8`);
  console.log(`   Leads: 10`);
  console.log(`   Contacts: 4`);
  console.log(`   Activities: 6`);
  console.log(`   Quotations: 3`);
  console.log(`   Maintenance Records: 6`);
  console.log(`   Subscriptions: 1`);
  console.log(`   Invoices: 4`);
  console.log(`   Tickets: 5`);
  console.log(`   Alerts: 5`);
  console.log(`   Trips: 9`);
  console.log(`   Plans: 2`);
  console.log(`   Geofences: 4`);
  console.log(`   Alert Rules: 7`);
  console.log(`   Contracts: 3`);
  console.log(`   Notifications: 8`);
  console.log(`   Settings: 15`);
  console.log('\n🔑 Test credentials:');
  console.log(`   Super Admin: admin@rtr.ae / REDACTED_DEMO_PASSWORD`);
  console.log(`   Ops Manager: ahmed.ops@rtr.ae / REDACTED_DEMO_PASSWORD`);
  console.log(`   Sales Manager: fatima.sales@rtr.ae / REDACTED_DEMO_PASSWORD`);
  console.log(`   Customer Admin: khalid@alfahim.ae / REDACTED_DEMO_PASSWORD`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
