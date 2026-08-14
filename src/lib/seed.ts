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
    },
  });
  console.log(`  ✅ Mega Logistics FZCO (${megaOrg.id})`);

  // ========================================
  // 2. USERS
  // ========================================
  console.log('\n👤 Creating users...');

  const adminPw = await hashPassword('REDACTED_DEMO_PASSWORD');
  const superAdmin = await db.user.create({
    data: {
      email: 'admin@rtr.ae',
      passwordHash: adminPw,
      name: 'RTR Admin',
      phone: '+971-50-111-2233',
      role: 'super_admin',
      organizationId: rtrOrg.id,
      status: 'active',
      emailVerified: true,
    },
  });
  console.log(`  ✅ Super Admin: admin@rtr.ae`);

  const opsPw = await hashPassword('REDACTED_DEMO_PASSWORD');
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

  const salesPw = await hashPassword('REDACTED_DEMO_PASSWORD');
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
  const customerPw = await hashPassword('REDACTED_DEMO_PASSWORD');
  const customerUser = await db.user.create({
    data: {
      email: 'khalid@alfahim.ae',
      passwordHash: customerPw,
      name: 'Khalid Al Fahim',
      phone: '+971-50-333-4455',
      role: 'admin',
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

  const q1Items = JSON.stringify([
    { description: 'GPS Tracking Device (GT06N)', quantity: 25, unitPrice: 150 },
    { description: 'SIM Card (Annual Plan)', quantity: 25, unitPrice: 120 },
    { description: 'Professional Installation', quantity: 25, unitPrice: 100 },
    { description: 'Premium Plan — Monthly Fee (x12)', quantity: 12, unitPrice: 1250 },
  ]);
  const q1Subtotal = 25 * 150 + 25 * 120 + 25 * 100 + 12 * 1250;
  const q1Tax = Math.round(q1Subtotal * 5 / 100 * 100) / 100;

  await db.quotation.create({
    data: {
      quotationNumber: 'RTR-Q-2408-0001',
      leadId: leads[0].id,
      organizationId: rtrOrg.id,
      items: q1Items,
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

  const q2Items = JSON.stringify([
    { description: 'GPS Tracking Device (FM1200)', quantity: 100, unitPrice: 180 },
    { description: 'SIM Card (Annual Plan)', quantity: 100, unitPrice: 100 },
    { description: 'Professional Installation', quantity: 100, unitPrice: 80 },
    { description: 'Premium Plan — Monthly Fee (x12)', quantity: 12, unitPrice: 5000 },
    { description: 'Custom API Integration', quantity: 1, unitPrice: 15000 },
    { description: 'Dedicated Account Manager', quantity: 12, unitPrice: 2000 },
  ]);
  const q2Subtotal = 100 * 180 + 100 * 100 + 100 * 80 + 12 * 5000 + 15000 + 12 * 2000;
  const q2Tax = Math.round(q2Subtotal * 5 / 100 * 100) / 100;

  await db.quotation.create({
    data: {
      quotationNumber: 'RTR-Q-2407-0002',
      leadId: leads[9].id,
      organizationId: rtrOrg.id,
      items: q2Items,
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

  const q3Items = JSON.stringify([
    { description: 'GPS Tracking Device (GT06N)', quantity: 10, unitPrice: 150 },
    { description: 'Temperature Sensor', quantity: 10, unitPrice: 75 },
    { description: 'SIM Card (Annual Plan)', quantity: 10, unitPrice: 120 },
    { description: 'Professional Installation', quantity: 10, unitPrice: 100 },
    { description: 'Premium Plan — Monthly Fee (x12)', quantity: 12, unitPrice: 500 },
  ]);
  const q3Subtotal = 10 * 150 + 10 * 75 + 10 * 120 + 10 * 100 + 12 * 500;
  const q3Tax = Math.round(q3Subtotal * 5 / 100 * 100) / 100;

  await db.quotation.create({
    data: {
      quotationNumber: 'RTR-Q-2408-0003',
      leadId: leads[1].id,
      organizationId: rtrOrg.id,
      items: q3Items,
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

  console.log('\n' + '='.repeat(50));
  console.log('🎉 Seed completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`   Organizations: 3`);
  console.log(`   Users: 4`);
  console.log(`   Vehicles: 5`);
  console.log(`   Drivers: 3`);
  console.log(`   Devices: 3`);
  console.log(`   Leads: 10`);
  console.log(`   Contacts: 4`);
  console.log(`   Activities: 6`);
  console.log(`   Quotations: 3`);
  console.log(`   Alerts: 5`);
  console.log(`   Tickets: 2`);
  console.log(`   Trips: 3`);
  console.log(`   Plans: 2`);
  console.log(`   Geofences: 2`);
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
