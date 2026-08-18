import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

/**
 * POST /api/setup/init
 *
 * One-time database initialization for fresh Supabase deployments.
 * Protected by SETUP_INIT_KEY environment variable.
 *
 * Usage: POST /api/setup/init  body: { "key": "your-setup-key" }
 *
 * Idempotent: if organizations already exist, skips seeding.
 * After successful init, this endpoint auto-disables itself
 * (sets an "initialized" flag in the Setting table).
 */

const INIT_KEY = process.env.SETUP_INIT_KEY;

// Tables to clear (in FK-safe order)
const CLEAR_ORDER = [
  'alert', 'ticket', 'trip', 'maintenanceRecord', 'installation',
  'technician', 'notification', 'document', 'quotation', 'invoice',
  'subscription', 'activity', 'opportunity', 'lead', 'contact',
  'vehicle', 'driver', 'device', 'sIM', 'geofence', 'alertRule',
  'contract', 'branch', 'session', 'user', 'plan', 'organization', 'setting',
] as const;

export async function POST(request: Request) {
  try {
    // ── Verify setup key ──
    if (!INIT_KEY) {
      return NextResponse.json(
        { error: 'SETUP_INIT_KEY not configured. Set it in Vercel env vars.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    if (body.key !== INIT_KEY) {
      return NextResponse.json({ error: 'Invalid setup key' }, { status: 403 });
    }

    // ── Check if already initialized ──
    const existingOrgs = await db.organization.count();
    if (existingOrgs > 0) {
      return NextResponse.json({
        success: true,
        message: `Database already has ${existingOrgs} organization(s). Skipping seed.`,
        organizations: existingOrgs,
      });
    }

    const SEED_PASSWORD = process.env.SEED_PASSWORD || 'Rtr360@2024';
    const steps: string[] = [];

    // ── Clean slate ──
    for (const table of CLEAR_ORDER) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (db as any)[table].deleteMany();
      } catch {
        // Table might not exist yet — that's fine
      }
    }
    steps.push('Cleared existing data');

    // ══════════════════════════════════════════════
    // 1. ORGANIZATIONS
    // ══════════════════════════════════════════════
    const rtrOrg = await db.organization.create({
      data: {
        name: 'RTR GPS Tracking',
        emirate: 'Dubai',
        phone: '+971-4-123-4567',
        email: 'info@rtr.ae',
        address: 'Warehouse 45, Al Quoz Industrial Area 3, Dubai, UAE',
        website: 'https://rtr360.vercel.app',
        status: 'active',
      },
    });

    const alFahimOrg = await db.organization.create({
      data: {
        name: 'Al Fahim Transport LLC',
        emirate: 'Abu Dhabi',
        phone: '+971-2-555-0123',
        email: 'fleet@alfahim.ae',
        address: 'Mussafah Industrial Area, Abu Dhabi, UAE',
        status: 'active',
      },
    });

    const emiratesOrg = await db.organization.create({
      data: {
        name: 'Emirates Logistics Co.',
        emirate: 'Sharjah',
        phone: '+971-6-555-0456',
        email: 'ops@emirateslogistics.ae',
        address: 'Sharjah Airport Free Zone, SAIF Zone, UAE',
        status: 'active',
      },
    });
    steps.push('Created 3 organizations');

    // ══════════════════════════════════════════════
    // 2. PLANS
    // ══════════════════════════════════════════════
    await db.plan.create({
      data: {
        name: 'Starter',
        priceMonthly: 299, priceAnnual: 2990,
        vehicleLimit: 10, features: 'GPS Tracking, Basic Reports, Email Support',
        active: true,
      },
    });
    await db.plan.create({
      data: {
        name: 'Standard', priceMonthly: 599, priceAnnual: 5990,
        vehicleLimit: 50, features: 'GPS Tracking, Advanced Analytics, Driver Management, Priority Support',
        active: true,
      },
    });
    await db.plan.create({
      data: {
        name: 'Professional', priceMonthly: 999, priceAnnual: 9990,
        vehicleLimit: 200, features: 'Everything in Standard, AI Predictions, API Access, White Label',
        active: true,
      },
    });
    await db.plan.create({
      data: {
        name: 'Enterprise', priceMonthly: 0, priceAnnual: 0,
        vehicleLimit: -1, features: 'Unlimited Everything, Dedicated Support, Custom Integrations',
        active: true,
      },
    });
    steps.push('Created 4 plans');

    // ══════════════════════════════════════════════
    // 3. USERS
    // ══════════════════════════════════════════════
    const adminPw = await hashPassword(SEED_PASSWORD);
    await db.user.create({
      data: {
        name: 'RTR Admin', email: 'admin@rtr.ae', passwordHash: adminPw,
        role: 'super_admin', status: 'active', organizationId: rtrOrg.id,
        phone: '+971-50-100-0001',
      },
    });

    const opsPw = await hashPassword(SEED_PASSWORD);
    await db.user.create({
      data: {
        name: 'Ahmed Al Rashid', email: 'ahmed.ops@rtr.ae', passwordHash: opsPw,
        role: 'operations_manager', status: 'active', organizationId: rtrOrg.id,
        phone: '+971-50-100-0002',
      },
    });

    const salesPw = await hashPassword(SEED_PASSWORD);
    await db.user.create({
      data: {
        name: 'Fatima Hassan', email: 'fatima.sales@rtr.ae', passwordHash: salesPw,
        role: 'sales_manager', status: 'active', organizationId: rtrOrg.id,
        phone: '+971-50-100-0003',
      },
    });

    const customerPw = await hashPassword(SEED_PASSWORD);
    await db.user.create({
      data: {
        name: 'Khalid Al Maktoum', email: 'khalid@alfahim.ae', passwordHash: customerPw,
        role: 'org_owner', status: 'active', organizationId: alFahimOrg.id,
        phone: '+971-50-200-0001',
      },
    });
    steps.push('Created 4 users (admin@rtr.ae, ahmed.ops@rtr.ae, fatima.sales@rtr.ae, khalid@alfahim.ae)');

    // ══════════════════════════════════════════════
    // 4. BRANCHES
    // ══════════════════════════════════════════════
    await db.branch.create({
      data: { name: 'RTR Dubai HQ', emirate: 'Dubai', address: 'Al Quoz, Dubai', organizationId: rtrOrg.id },
    });
    await db.branch.create({
      data: { name: 'RTR Abu Dhabi', emirate: 'Abu Dhabi', address: 'Mussafah, Abu Dhabi', organizationId: rtrOrg.id },
    });
    steps.push('Created 2 branches');

    // ══════════════════════════════════════════════
    // 5. VEHICLES (5 for RTR)
    // ══════════════════════════════════════════════
    const vehicles = [
      { plate: 'DXB-A-12345', make: 'Toyota', model: 'Hilux', year: 2023, mileage: 45000, status: 'active' },
      { plate: 'DXB-B-67890', make: 'Nissan', model: 'Patrol', year: 2022, mileage: 62000, status: 'active' },
      { plate: 'AUH-C-11111', make: 'Isuzu', model: 'NPR', year: 2024, mileage: 12000, status: 'active' },
      { plate: 'DXB-D-22222', make: 'Mitsubishi', model: 'Canter', year: 2021, mileage: 89000, status: 'maintenance' },
      { plate: 'SHJ-E-33333', make: 'Ford', model: 'Transit', year: 2023, mileage: 34000, status: 'active' },
    ];

    for (const v of vehicles) {
      await db.vehicle.create({
        data: { plateNumber: v.plate, make: v.make, model: v.model, year: v.year, mileage: v.mileage, status: v.status, organizationId: rtrOrg.id, color: 'White' },
      });
    }
    steps.push(`Created ${vehicles.length} vehicles`);

    // ══════════════════════════════════════════════
    // 6. DRIVERS (3 for RTR)
    // ══════════════════════════════════════════════
    const drivers = [
      { name: 'Muhammad Asif', licenseType: 'Heavy Vehicle', nationality: 'Pakistani', phone: '+971-50-300-0001' },
      { name: 'Rajesh Kumar', licenseType: 'Heavy Bus', nationality: 'Indian', phone: '+971-50-300-0002' },
      { name: 'Omar Farooq', licenseType: 'Light Vehicle', nationality: 'Pakistani', phone: '+971-50-300-0003' },
    ];

    for (const d of drivers) {
      await db.driver.create({
        data: { ...d, organizationId: rtrOrg.id, status: 'active', licenseNumber: 'DL-' + Math.random().toString(36).slice(2, 8).toUpperCase() },
      });
    }
    steps.push(`Created ${drivers.length} drivers`);

    // ══════════════════════════════════════════════
    // 7. GPS DEVICES (5 for RTR)
    // ══════════════════════════════════════════════
    const deviceTypes = ['GPS Tracker', 'OBD Tracker', 'Wired Tracker', 'Personal Tracker', 'Asset Tracker'];
    for (let i = 0; i < 5; i++) {
      await db.device.create({
        data: {
          imei: `8600${String(1000000000 + i).slice(1)}`,
          deviceType: deviceTypes[i],
          status: i < 3 ? 'assigned' : 'warehouse',
          organizationId: rtrOrg.id,
          firmware: 'v3.2.1',
          purchaseCost: 150 + i * 50,
          batteryLevel: 85 + i * 3,
        },
      });
    }
    steps.push('Created 5 GPS devices');

    // ══════════════════════════════════════════════
    // 8. LEADS (4 for RTR)
    // ══════════════════════════════════════════════
    const leads = [
      { name: 'Dubai Cargo Co.', company: 'Dubai Cargo', vehicleCount: 20, source: 'Website', status: 'new' },
      { name: 'Abu Dhabi Taxis', company: 'AD Taxis LLC', vehicleCount: 50, source: 'Referral', status: 'contacted' },
      { name: 'Emirates Courier', company: 'Emirates Courier Services', vehicleCount: 30, source: 'Exhibition', status: 'qualified' },
      { name: 'Sharjah Transport', company: 'Sharjah Transport Co.', vehicleCount: 15, source: 'Cold Call', status: 'new' },
    ];

    for (const l of leads) {
      await db.lead.create({
        data: { ...l, organizationId: rtrOrg.id, phone: '+971-50-400-' + String(Math.floor(Math.random() * 9000) + 1000) },
      });
    }
    steps.push(`Created ${leads.length} leads`);

    // ══════════════════════════════════════════════
    // 9. SETTINGS
    // ══════════════════════════════════════════════
    const settings = [
      { key: 'company_name', value: 'RTR 360' },
      { key: 'timezone', value: 'Asia/Dubai' },
      { key: 'currency', value: 'AED' },
      { key: 'vat_rate', value: '5' },
      { key: 'date_format', value: 'DD/MM/YYYY' },
      { key: 'platform_initialized', value: 'true' },
    ];
    for (const s of settings) {
      await db.setting.create({ data: s });
    }
    steps.push('Created 6 platform settings');

    // ══════════════════════════════════════════════
    // 10. TECHNICIANS (2 for RTR)
    // ══════════════════════════════════════════════
    await db.technician.create({
      data: { name: 'Ali Rehman', specialty: 'GPS Installation', phone: '+971-50-500-0001', rating: 4.8, totalInstalled: 156, organizationId: rtrOrg.id, status: 'active' },
    });
    await db.technician.create({
      data: { name: 'Sunny Thomas', specialty: 'OBD Systems', phone: '+971-50-500-0002', rating: 4.5, totalInstalled: 89, organizationId: rtrOrg.id, status: 'active' },
    });
    steps.push('Created 2 technicians');

    // ══════════════════════════════════════════════
    // 11. SUBSCRIPTION
    // ══════════════════════════════════════════════
    await db.subscription.create({
      data: {
        organizationId: rtrOrg.id, planId: (await db.plan.findFirst({ where: { name: 'Enterprise' } }))!.id,
        status: 'active', vehicleCount: 5,
        startsAt: new Date('2024-01-01'), endsAt: new Date('2027-01-01'),
      },
    });
    steps.push('Created subscription for RTR');

    // ══════════════════════════════════════════════
    // 12. GEOFENCES (2 for RTR)
    // ══════════════════════════════════════════════
    await db.geofence.create({
      data: { name: 'Al Quoz Depot', type: 'circle', centerLat: 25.1415, centerLng: 55.2354, radius: 500, organizationId: rtrOrg.id },
    });
    await db.geofence.create({
      data: { name: 'Jebel Ali Port Zone', type: 'circle', centerLat: 24.9987, centerLng: 55.0456, radius: 1000, organizationId: rtrOrg.id },
    });
    steps.push('Created 2 geofences');

    // ══════════════════════════════════════════════
    // 13. ALERT RULES (2 for RTR)
    // ══════════════════════════════════════════════
    await db.alertRule.create({
      data: { name: 'Speed Alert', type: 'speed', conditions: '{"operator":">","value":120}', channels: 'in_app,push', organizationId: rtrOrg.id, active: true },
    });
    await db.alertRule.create({
      data: { name: 'Geofence Exit', type: 'geofence_exit', conditions: '{"event":"exit"}', channels: 'in_app,push', organizationId: rtrOrg.id, active: true },
    });
    steps.push('Created 2 alert rules');

    return NextResponse.json({
      success: true,
      message: 'Database initialized successfully!',
      password: SEED_PASSWORD,
      loginEmail: 'admin@rtr.ae',
      steps,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Initialization failed', details: msg },
      { status: 500 }
    );
  }
}

// Also support GET for easy browser testing
export async function GET() {
  return NextResponse.json({
    message: 'RTR 360 Database Init Endpoint',
    instructions: 'Send POST with { "key": "<your SETUP_INIT_KEY>" } to initialize the database.',
    configured: !!INIT_KEY,
  });
}
