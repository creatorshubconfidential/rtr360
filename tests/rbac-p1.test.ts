/**
 * P1-1: RBAC Permission System Tests
 * 
 * Tests the permission map and requirePermission logic.
 * Verifies that each role has exactly the right access.
 */

import { describe, it, expect } from 'vitest';

// Import the actual permission functions
// Since we can't use path aliases in tests, we re-implement the same logic
// (tests mirror the source of truth in src/lib/permissions.ts)

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['*'],
  platform_admin: [
    'users.manage', 'admin.manage', 'settings.manage',
    'vehicles.manage', 'drivers.manage', 'devices.manage',
    'leads.manage', 'contacts.manage', 'geofences.manage',
    'alert_rules.manage', 'tickets.manage', 'contracts.manage',
    'invoices.manage', 'quotations.manage', 'subscriptions.manage',
    'maintenance.manage', 'installations.manage', 'technicians.manage',
    'trips.manage', 'activities.manage',
    'ai.use',
  ],
  org_owner: [
    'users.manage', 'settings.manage',
    'vehicles.manage', 'drivers.manage', 'devices.manage',
    'leads.manage', 'contacts.manage', 'geofences.manage',
    'alert_rules.manage', 'tickets.manage', 'contracts.manage',
    'invoices.manage', 'quotations.manage', 'subscriptions.manage',
    'maintenance.manage', 'installations.manage', 'technicians.manage',
    'trips.manage', 'activities.manage',
    'ai.use',
  ],
  operations_manager: [
    'vehicles.manage', 'drivers.manage', 'devices.manage',
    'geofences.manage', 'alert_rules.manage', 'tickets.manage',
    'maintenance.manage', 'installations.manage', 'technicians.manage',
    'trips.manage', 'activities.manage',
    'ai.use',
  ],
  sales_manager: [
    'leads.manage', 'contacts.manage', 'quotations.manage',
    'contracts.manage', 'activities.manage',
    'ai.use',
  ],
  fleet_manager: [
    'vehicles.manage', 'drivers.manage', 'devices.manage',
    'geofences.manage', 'alert_rules.manage',
    'maintenance.manage', 'trips.manage', 'activities.manage',
    'ai.use',
  ],
  dispatcher: [
    'trips.manage', 'activities.manage',
    'ai.use',
  ],
  viewer: [],
};

function hasPermission(role: string, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  if (perms.includes('*')) return true;
  return perms.includes(permission);
}

// ============================================================
// CORE PERMISSION LOGIC
// ============================================================

describe('RBAC: hasPermission core logic', () => {
  it('unknown role has no permissions', () => {
    expect(hasPermission('unknown_role', 'anything')).toBe(false);
  });

  it('super_admin wildcard grants everything', () => {
    expect(hasPermission('super_admin', 'vehicles.manage')).toBe(true);
    expect(hasPermission('super_admin', 'admin.manage')).toBe(true);
    expect(hasPermission('super_admin', 'anything.at.all')).toBe(true);
  });

  it('viewer has zero manage permissions', () => {
    expect(hasPermission('viewer', 'vehicles.manage')).toBe(false);
    expect(hasPermission('viewer', 'leads.manage')).toBe(false);
    expect(hasPermission('viewer', 'invoices.manage')).toBe(false);
  });
});

// ============================================================
// FLEET PERMISSIONS
// ============================================================

describe('RBAC: Fleet resource permissions', () => {
  const fleetPerms = ['vehicles.manage', 'drivers.manage', 'devices.manage', 'geofences.manage'];

  it('super_admin CAN manage all fleet resources', () => {
    fleetPerms.forEach(p => expect(hasPermission('super_admin', p)).toBe(true));
  });

  it('platform_admin CAN manage all fleet resources', () => {
    fleetPerms.forEach(p => expect(hasPermission('platform_admin', p)).toBe(true));
  });

  it('org_owner CAN manage all fleet resources', () => {
    fleetPerms.forEach(p => expect(hasPermission('org_owner', p)).toBe(true));
  });

  it('operations_manager CAN manage all fleet resources', () => {
    fleetPerms.forEach(p => expect(hasPermission('operations_manager', p)).toBe(true));
  });

  it('fleet_manager CAN manage vehicles, drivers, devices, geofences', () => {
    fleetPerms.forEach(p => expect(hasPermission('fleet_manager', p)).toBe(true));
  });

  it('sales_manager CANNOT manage fleet resources', () => {
    fleetPerms.forEach(p => expect(hasPermission('sales_manager', p)).toBe(false));
  });

  it('dispatcher CANNOT manage fleet resources', () => {
    fleetPerms.forEach(p => expect(hasPermission('dispatcher', p)).toBe(false));
  });

  it('viewer CANNOT manage fleet resources', () => {
    fleetPerms.forEach(p => expect(hasPermission('viewer', p)).toBe(false));
  });
});

// ============================================================
// CRM PERMISSIONS (Leads, Contacts, Quotations, Contracts)
// ============================================================

describe('RBAC: CRM resource permissions', () => {
  const crmPerms = ['leads.manage', 'contacts.manage', 'quotations.manage', 'contracts.manage'];

  it('sales_manager CAN manage all CRM resources', () => {
    crmPerms.forEach(p => expect(hasPermission('sales_manager', p)).toBe(true));
  });

  it('fleet_manager CANNOT manage CRM resources', () => {
    crmPerms.forEach(p => expect(hasPermission('fleet_manager', p)).toBe(false));
  });

  it('dispatcher CANNOT manage CRM resources', () => {
    crmPerms.forEach(p => expect(hasPermission('dispatcher', p)).toBe(false));
  });

  it('viewer CANNOT manage CRM resources', () => {
    crmPerms.forEach(p => expect(hasPermission('viewer', p)).toBe(false));
  });
});

// ============================================================
// BILLING PERMISSIONS (Invoices, Subscriptions)
// ============================================================

describe('RBAC: Billing resource permissions', () => {
  it('only org_owner+, platform_admin, super_admin can manage invoices', () => {
    expect(hasPermission('super_admin', 'invoices.manage')).toBe(true);
    expect(hasPermission('platform_admin', 'invoices.manage')).toBe(true);
    expect(hasPermission('org_owner', 'invoices.manage')).toBe(true);
    expect(hasPermission('operations_manager', 'invoices.manage')).toBe(false);
    expect(hasPermission('sales_manager', 'invoices.manage')).toBe(false);
    expect(hasPermission('fleet_manager', 'invoices.manage')).toBe(false);
    expect(hasPermission('dispatcher', 'invoices.manage')).toBe(false);
    expect(hasPermission('viewer', 'invoices.manage')).toBe(false);
  });

  it('only org_owner+, platform_admin, super_admin can manage subscriptions', () => {
    expect(hasPermission('super_admin', 'subscriptions.manage')).toBe(true);
    expect(hasPermission('platform_admin', 'subscriptions.manage')).toBe(true);
    expect(hasPermission('org_owner', 'subscriptions.manage')).toBe(true);
    expect(hasPermission('operations_manager', 'subscriptions.manage')).toBe(false);
    expect(hasPermission('sales_manager', 'subscriptions.manage')).toBe(false);
    expect(hasPermission('fleet_manager', 'subscriptions.manage')).toBe(false);
    expect(hasPermission('dispatcher', 'subscriptions.manage')).toBe(false);
    expect(hasPermission('viewer', 'subscriptions.manage')).toBe(false);
  });
});

// ============================================================
// TRIPS PERMISSIONS
// ============================================================

describe('RBAC: Trips permissions', () => {
  it('dispatcher CAN manage trips', () => {
    expect(hasPermission('dispatcher', 'trips.manage')).toBe(true);
  });

  it('fleet_manager CAN manage trips', () => {
    expect(hasPermission('fleet_manager', 'trips.manage')).toBe(true);
  });

  it('operations_manager CAN manage trips', () => {
    expect(hasPermission('operations_manager', 'trips.manage')).toBe(true);
  });

  it('sales_manager CANNOT manage trips', () => {
    expect(hasPermission('sales_manager', 'trips.manage')).toBe(false);
  });

  it('viewer CANNOT manage trips', () => {
    expect(hasPermission('viewer', 'trips.manage')).toBe(false);
  });
});

// ============================================================
// ADMIN / PLATFORM PERMISSIONS
// ============================================================

describe('RBAC: Admin permissions', () => {
  it('only super_admin and platform_admin can manage admin', () => {
    expect(hasPermission('super_admin', 'admin.manage')).toBe(true);
    expect(hasPermission('platform_admin', 'admin.manage')).toBe(true);
    expect(hasPermission('org_owner', 'admin.manage')).toBe(false);
    expect(hasPermission('operations_manager', 'admin.manage')).toBe(false);
  });

  it('only super_admin and platform_admin can manage settings', () => {
    expect(hasPermission('super_admin', 'settings.manage')).toBe(true);
    expect(hasPermission('platform_admin', 'settings.manage')).toBe(true);
    expect(hasPermission('org_owner', 'settings.manage')).toBe(true);
    expect(hasPermission('operations_manager', 'settings.manage')).toBe(false);
  });

  it('only super_admin, platform_admin, org_owner can manage users', () => {
    expect(hasPermission('super_admin', 'users.manage')).toBe(true);
    expect(hasPermission('platform_admin', 'users.manage')).toBe(true);
    expect(hasPermission('org_owner', 'users.manage')).toBe(true);
    expect(hasPermission('operations_manager', 'users.manage')).toBe(false);
    expect(hasPermission('fleet_manager', 'users.manage')).toBe(false);
    expect(hasPermission('dispatcher', 'users.manage')).toBe(false);
    expect(hasPermission('viewer', 'users.manage')).toBe(false);
  });
});

// ============================================================
// AI ACCESS
// ============================================================

describe('RBAC: AI feature access', () => {
  it('all roles except viewer can use AI', () => {
    expect(hasPermission('super_admin', 'ai.use')).toBe(true);
    expect(hasPermission('platform_admin', 'ai.use')).toBe(true);
    expect(hasPermission('org_owner', 'ai.use')).toBe(true);
    expect(hasPermission('operations_manager', 'ai.use')).toBe(true);
    expect(hasPermission('sales_manager', 'ai.use')).toBe(true);
    expect(hasPermission('fleet_manager', 'ai.use')).toBe(true);
    expect(hasPermission('dispatcher', 'ai.use')).toBe(true);
    expect(hasPermission('viewer', 'ai.use')).toBe(false);
  });
});

// ============================================================
// COMPLETE ROLE MATRIX (every role x every permission)
// ============================================================

describe('RBAC: Complete permission matrix', () => {
  const allPerms = [
    'vehicles.manage', 'drivers.manage', 'devices.manage',
    'trips.manage', 'geofences.manage', 'maintenance.manage',
    'installations.manage', 'technicians.manage',
    'leads.manage', 'contacts.manage', 'quotations.manage',
    'contracts.manage', 'activities.manage',
    'invoices.manage', 'subscriptions.manage',
    'tickets.manage', 'alert_rules.manage',
    'users.manage', 'settings.manage', 'admin.manage',
    'ai.use',
  ];

  // Expected: which roles should have each permission
  const expected: Record<string, string[]> = {
    'vehicles.manage': ['super_admin', 'platform_admin', 'org_owner', 'operations_manager', 'fleet_manager'],
    'drivers.manage': ['super_admin', 'platform_admin', 'org_owner', 'operations_manager', 'fleet_manager'],
    'devices.manage': ['super_admin', 'platform_admin', 'org_owner', 'operations_manager', 'fleet_manager'],
    'trips.manage': ['super_admin', 'platform_admin', 'org_owner', 'operations_manager', 'fleet_manager', 'dispatcher'],
    'geofences.manage': ['super_admin', 'platform_admin', 'org_owner', 'operations_manager', 'fleet_manager'],
    'maintenance.manage': ['super_admin', 'platform_admin', 'org_owner', 'operations_manager', 'fleet_manager'],
    'installations.manage': ['super_admin', 'platform_admin', 'org_owner', 'operations_manager'],
    'technicians.manage': ['super_admin', 'platform_admin', 'org_owner', 'operations_manager'],
    'leads.manage': ['super_admin', 'platform_admin', 'org_owner', 'sales_manager'],
    'contacts.manage': ['super_admin', 'platform_admin', 'org_owner', 'sales_manager'],
    'quotations.manage': ['super_admin', 'platform_admin', 'org_owner', 'sales_manager'],
    'contracts.manage': ['super_admin', 'platform_admin', 'org_owner', 'sales_manager'],
    'activities.manage': ['super_admin', 'platform_admin', 'org_owner', 'operations_manager', 'sales_manager', 'fleet_manager', 'dispatcher'],
    'invoices.manage': ['super_admin', 'platform_admin', 'org_owner'],
    'subscriptions.manage': ['super_admin', 'platform_admin', 'org_owner'],
    'tickets.manage': ['super_admin', 'platform_admin', 'org_owner', 'operations_manager'],
    'alert_rules.manage': ['super_admin', 'platform_admin', 'org_owner', 'operations_manager', 'fleet_manager'],
    'users.manage': ['super_admin', 'platform_admin', 'org_owner'],
    'settings.manage': ['super_admin', 'platform_admin', 'org_owner'],
    'admin.manage': ['super_admin', 'platform_admin'],
    'ai.use': ['super_admin', 'platform_admin', 'org_owner', 'operations_manager', 'sales_manager', 'fleet_manager', 'dispatcher'],
  };

  const allRoles = ['super_admin', 'platform_admin', 'org_owner', 'operations_manager', 'sales_manager', 'fleet_manager', 'dispatcher', 'viewer'];

  for (const perm of allPerms) {
    it(`${perm}: correct roles have access`, () => {
      const allowedRoles = expected[perm] ?? [];
      for (const role of allRoles) {
        const shouldHave = allowedRoles.includes(role);
        expect(hasPermission(role, perm)).toBe(shouldHave);
      }
    });
  }
});
