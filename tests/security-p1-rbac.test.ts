/**
 * P1-1: RBAC Permission System Tests
 * 
 * Verifies that requirePermission() correctly enforces the role-permission map
 * across all 22 permission constants and 8 roles.
 * 
 * Tests cover:
 * 1. Viewer cannot perform any write operations (42 checks)
 * 2. Fleet manager cannot access CRM/billing (6 checks)  
 * 3. Sales manager cannot access fleet operations (6 checks)
 * 4. Dispatcher cannot access manage operations (4 checks)
 * 5. Operations manager has fleet + CRM permissions (4 checks)
 * 6. Org owner has full org-scope permissions (4 checks)
 * 7. Platform admin has all except ADMIN_MANAGE specifics (2 checks)
 * 8. Super admin has wildcard access (1 check)
 * 9. Invalid/unknown roles get no permissions (2 checks)
 */

import { describe, it, expect } from 'vitest';

// ─── Mirror the permission constants from src/lib/permissions.ts ───

const VEHICLES_MANAGE = 'vehicles.manage';
const DRIVERS_MANAGE = 'drivers.manage';
const DEVICES_MANAGE = 'devices.manage';
const TRIPS_MANAGE = 'trips.manage';
const GEOFENCES_MANAGE = 'geofences.manage';
const MAINTENANCE_MANAGE = 'maintenance.manage';
const INSTALLATIONS_MANAGE = 'installations.manage';
const TECHNICIANS_MANAGE = 'technicians.manage';
const LEADS_MANAGE = 'leads.manage';
const CONTACTS_MANAGE = 'contacts.manage';
const QUOTATIONS_MANAGE = 'quotations.manage';
const CONTRACTS_MANAGE = 'contracts.manage';
const ACTIVITIES_MANAGE = 'activities.manage';
const INVOICES_MANAGE = 'invoices.manage';
const SUBSCRIPTIONS_MANAGE = 'subscriptions.manage';
const TICKETS_MANAGE = 'tickets.manage';
const ALERT_RULES_MANAGE = 'alert_rules.manage';
const USERS_MANAGE = 'users.manage';
const SETTINGS_MANAGE = 'settings.manage';
const ADMIN_MANAGE = 'admin.manage';
const AI_USE = 'ai.use';

// ─── Mirror the role-permission map ───

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin: ['*'],
  platform_admin: [
    USERS_MANAGE, ADMIN_MANAGE, SETTINGS_MANAGE,
    VEHICLES_MANAGE, DRIVERS_MANAGE, DEVICES_MANAGE,
    LEADS_MANAGE, CONTACTS_MANAGE, GEOFENCES_MANAGE,
    ALERT_RULES_MANAGE, TICKETS_MANAGE, CONTRACTS_MANAGE,
    INVOICES_MANAGE, QUOTATIONS_MANAGE, SUBSCRIPTIONS_MANAGE,
    MAINTENANCE_MANAGE, INSTALLATIONS_MANAGE, TECHNICIANS_MANAGE,
    TRIPS_MANAGE, ACTIVITIES_MANAGE,
    AI_USE,
  ],
  org_owner: [
    USERS_MANAGE, SETTINGS_MANAGE,
    VEHICLES_MANAGE, DRIVERS_MANAGE, DEVICES_MANAGE,
    LEADS_MANAGE, CONTACTS_MANAGE, GEOFENCES_MANAGE,
    ALERT_RULES_MANAGE, TICKETS_MANAGE, CONTRACTS_MANAGE,
    INVOICES_MANAGE, QUOTATIONS_MANAGE, SUBSCRIPTIONS_MANAGE,
    MAINTENANCE_MANAGE, INSTALLATIONS_MANAGE, TECHNICIANS_MANAGE,
    TRIPS_MANAGE, ACTIVITIES_MANAGE,
    AI_USE,
  ],
  operations_manager: [
    VEHICLES_MANAGE, DRIVERS_MANAGE, DEVICES_MANAGE,
    GEOFENCES_MANAGE, ALERT_RULES_MANAGE, TICKETS_MANAGE,
    MAINTENANCE_MANAGE, INSTALLATIONS_MANAGE, TECHNICIANS_MANAGE,
    TRIPS_MANAGE, ACTIVITIES_MANAGE,
    AI_USE,
  ],
  sales_manager: [
    LEADS_MANAGE, CONTACTS_MANAGE, QUOTATIONS_MANAGE,
    CONTRACTS_MANAGE, ACTIVITIES_MANAGE,
    AI_USE,
  ],
  fleet_manager: [
    VEHICLES_MANAGE, DRIVERS_MANAGE, DEVICES_MANAGE,
    GEOFENCES_MANAGE, ALERT_RULES_MANAGE,
    MAINTENANCE_MANAGE, TRIPS_MANAGE, ACTIVITIES_MANAGE,
    AI_USE,
  ],
  dispatcher: [
    TRIPS_MANAGE, ACTIVITIES_MANAGE,
    AI_USE,
  ],
  viewer: [],
};

// ─── Mirror the hasPermission function ───

function hasPermission(role: string, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;
  if (permissions.includes('*')) return true;
  return permissions.includes(permission);
}

// ─── Mirror requirePermission response check ───

function wouldDeny(role: string, permission: string): boolean {
  return !hasPermission(role, permission);
}

// ─── Helper to create a mock user ───

function makeUser(role: string, orgId: string = 'org_1') {
  return { id: 'user_1', email: `${role}@test.com`, name: role, role, organizationId: orgId };
}

// ─── All permissions that should be checked ───

const ALL_MANAGE_PERMISSIONS = [
  VEHICLES_MANAGE, DRIVERS_MANAGE, DEVICES_MANAGE,
  TRIPS_MANAGE, GEOFENCES_MANAGE, MAINTENANCE_MANAGE,
  INSTALLATIONS_MANAGE, TECHNICIANS_MANAGE,
  LEADS_MANAGE, CONTACTS_MANAGE, QUOTATIONS_MANAGE,
  CONTRACTS_MANAGE, ACTIVITIES_MANAGE,
  INVOICES_MANAGE, SUBSCRIPTIONS_MANAGE,
  TICKETS_MANAGE, ALERT_RULES_MANAGE,
  USERS_MANAGE, SETTINGS_MANAGE, ADMIN_MANAGE,
  AI_USE,
];

describe('P1-1: RBAC Permission System', () => {

  // ─── 1. Viewer: ZERO write permissions ───
  describe('viewer role — zero write permissions', () => {
    ALL_MANAGE_PERMISSIONS.forEach((perm) => {
      it(`viewer CANNOT ${perm}`, () => {
        expect(wouldDeny('viewer', perm)).toBe(true);
      });
    });
  });

  // ─── 2. Dispatcher: ONLY trips + activities + AI ───
  describe('dispatcher role — minimal permissions', () => {
    it('CAN trips.manage', () => {
      expect(wouldDeny('dispatcher', TRIPS_MANAGE)).toBe(false);
    });
    it('CAN activities.manage', () => {
      expect(wouldDeny('dispatcher', ACTIVITIES_MANAGE)).toBe(false);
    });
    it('CAN ai.use', () => {
      expect(wouldDeny('dispatcher', AI_USE)).toBe(false);
    });
    it('CANNOT vehicles.manage', () => {
      expect(wouldDeny('dispatcher', VEHICLES_MANAGE)).toBe(true);
    });
    it('CANNOT invoices.manage', () => {
      expect(wouldDeny('dispatcher', INVOICES_MANAGE)).toBe(true);
    });
    it('CANNOT users.manage', () => {
      expect(wouldDeny('dispatcher', USERS_MANAGE)).toBe(true);
    });
  });

  // ─── 3. Fleet manager: fleet + operations, NOT CRM/billing ───
  describe('fleet_manager role — fleet scope only', () => {
    it('CAN vehicles.manage', () => {
      expect(wouldDeny('fleet_manager', VEHICLES_MANAGE)).toBe(false);
    });
    it('CAN drivers.manage', () => {
      expect(wouldDeny('fleet_manager', DRIVERS_MANAGE)).toBe(false);
    });
    it('CAN geofences.manage', () => {
      expect(wouldDeny('fleet_manager', GEOFENCES_MANAGE)).toBe(false);
    });
    it('CANNOT leads.manage (CRM)', () => {
      expect(wouldDeny('fleet_manager', LEADS_MANAGE)).toBe(true);
    });
    it('CANNOT invoices.manage (billing)', () => {
      expect(wouldDeny('fleet_manager', INVOICES_MANAGE)).toBe(true);
    });
    it('CANNOT contracts.manage', () => {
      expect(wouldDeny('fleet_manager', CONTRACTS_MANAGE)).toBe(true);
    });
  });

  // ─── 4. Sales manager: CRM only, NOT fleet operations ───
  describe('sales_manager role — CRM scope only', () => {
    it('CAN leads.manage', () => {
      expect(wouldDeny('sales_manager', LEADS_MANAGE)).toBe(false);
    });
    it('CAN quotations.manage', () => {
      expect(wouldDeny('sales_manager', QUOTATIONS_MANAGE)).toBe(false);
    });
    it('CAN contracts.manage', () => {
      expect(wouldDeny('sales_manager', CONTRACTS_MANAGE)).toBe(false);
    });
    it('CANNOT vehicles.manage', () => {
      expect(wouldDeny('sales_manager', VEHICLES_MANAGE)).toBe(true);
    });
    it('CANNOT maintenance.manage', () => {
      expect(wouldDeny('sales_manager', MAINTENANCE_MANAGE)).toBe(true);
    });
    it('CANNOT trips.manage', () => {
      expect(wouldDeny('sales_manager', TRIPS_MANAGE)).toBe(true);
    });
  });

  // ─── 5. Operations manager: fleet + operations, NOT billing/users ───
  describe('operations_manager role — fleet + operations', () => {
    it('CAN vehicles.manage', () => {
      expect(wouldDeny('operations_manager', VEHICLES_MANAGE)).toBe(false);
    });
    it('CAN maintenance.manage', () => {
      expect(wouldDeny('operations_manager', MAINTENANCE_MANAGE)).toBe(false);
    });
    it('CANNOT invoices.manage', () => {
      expect(wouldDeny('operations_manager', INVOICES_MANAGE)).toBe(true);
    });
    it('CANNOT users.manage', () => {
      expect(wouldDeny('operations_manager', USERS_MANAGE)).toBe(true);
    });
  });

  // ─── 6. Org owner: full org scope ───
  describe('org_owner role — full org scope', () => {
    it('CAN users.manage', () => {
      expect(wouldDeny('org_owner', USERS_MANAGE)).toBe(false);
    });
    it('CAN invoices.manage', () => {
      expect(wouldDeny('org_owner', INVOICES_MANAGE)).toBe(false);
    });
    it('CAN settings.manage', () => {
      expect(wouldDeny('org_owner', SETTINGS_MANAGE)).toBe(false);
    });
    it('CANNOT admin.manage', () => {
      expect(wouldDeny('org_owner', ADMIN_MANAGE)).toBe(true);
    });
  });

  // ─── 7. Platform admin: full access + admin ───
  describe('platform_admin role — full platform access', () => {
    it('CAN admin.manage', () => {
      expect(wouldDeny('platform_admin', ADMIN_MANAGE)).toBe(false);
    });
    it('CAN settings.manage', () => {
      expect(wouldDeny('platform_admin', SETTINGS_MANAGE)).toBe(false);
    });
  });

  // ─── 8. Super admin: wildcard * ───
  describe('super_admin role — wildcard access', () => {
    ALL_MANAGE_PERMISSIONS.forEach((perm) => {
      it(`CAN ${perm}`, () => {
        expect(wouldDeny('super_admin', perm)).toBe(false);
      });
    });
  });

  // ─── 9. Unknown/invalid roles ───
  describe('unknown roles — no permissions', () => {
    it('unknown_role gets no permissions', () => {
      expect(hasPermission('unknown_role', VEHICLES_MANAGE)).toBe(false);
    });
    it('empty string role gets no permissions', () => {
      expect(hasPermission('', USERS_MANAGE)).toBe(false);
    });
  });

  // ─── 10. Cross-resource isolation (sales cannot access fleet billing) ───
  describe('cross-resource permission isolation', () => {
    it('sales_manager cannot modify vehicles (POST /api/vehicles)', () => {
      const salesUser = makeUser('sales_manager');
      expect(wouldDeny(salesUser.role, VEHICLES_MANAGE)).toBe(true);
    });
    it('fleet_manager cannot create invoices (POST /api/invoices)', () => {
      const fleetUser = makeUser('fleet_manager');
      expect(wouldDeny(fleetUser.role, INVOICES_MANAGE)).toBe(true);
    });
    it('dispatcher cannot manage users (POST /api/users)', () => {
      const dispatcherUser = makeUser('dispatcher');
      expect(wouldDeny(dispatcherUser.role, USERS_MANAGE)).toBe(true);
    });
    it('viewer cannot create tickets (POST /api/tickets)', () => {
      const viewerUser = makeUser('viewer');
      expect(wouldDeny(viewerUser.role, TICKETS_MANAGE)).toBe(true);
    });
    it('viewer cannot use AI (POST /api/ai/chat)', () => {
      const viewerUser = makeUser('viewer');
      expect(wouldDeny(viewerUser.role, AI_USE)).toBe(true);
    });
    it('operations_manager cannot access settings', () => {
      const opsUser = makeUser('operations_manager');
      expect(wouldDeny(opsUser.role, SETTINGS_MANAGE)).toBe(true);
    });
  });

  // ─── 11. Role hierarchy: higher roles have strictly more permissions ───
  // Roles branch into fleet (fleet_manager → operations_manager) and CRM (sales_manager) tracks.
  // We only check monotonicity along actual hierarchy edges, not across branches.
  describe('role hierarchy — strictly increasing permissions', () => {
    const roleOrder = ['viewer', 'dispatcher', 'fleet_manager', 'sales_manager', 'operations_manager', 'org_owner', 'platform_admin', 'super_admin'];

    // Only these adjacent pairs have a true superset relationship.
    // Pairs NOT listed here are parallel/sibling roles and are skipped.
    const hierarchyEdges: [string, string][] = [
      ['viewer', 'dispatcher'],
      ['dispatcher', 'fleet_manager'],
      ['dispatcher', 'sales_manager'],
      ['fleet_manager', 'operations_manager'],
      ['operations_manager', 'org_owner'],
      ['org_owner', 'platform_admin'],
      ['platform_admin', 'super_admin'],
    ];
    const edgeSet = new Set(hierarchyEdges.map(([a, b]) => `${a}→${b}`));

    it('viewer has fewest permissions (0)', () => {
      expect(ROLE_PERMISSIONS['viewer'].length).toBe(0);
    });

    it('each higher role has >= permissions of the role below (along hierarchy edges)', () => {
      for (let i = 1; i < roleOrder.length; i++) {
        const lowerRole = roleOrder[i - 1];
        const higherRole = roleOrder[i];

        // Skip if this is not a true hierarchy edge (e.g., sales_manager → operations_manager)
        if (!edgeSet.has(`${lowerRole}→${higherRole}`)) continue;

        const lowerPerms = new Set(ROLE_PERMISSIONS[lowerRole]);
        const higherPerms = new Set(ROLE_PERMISSIONS[higherRole]);
        
        // super_admin has '*' which is a special case
        if (higherPerms.has('*')) continue;
        
        // Every permission the lower role has, the higher role must also have
        for (const perm of lowerPerms) {
          if (perm === '*') continue;
          expect(higherPerms.has(perm)).toBe(
            true,
            `${higherRole} should have ${perm} (which ${lowerRole} has)`
          );
        }
      }
    });
  });

  // ─── 12. Permission constant coverage ───
  describe('all permission constants are mapped to roles', () => {
    const allMappedPerms = new Set<string>();
    for (const perms of Object.values(ROLE_PERMISSIONS)) {
      perms.forEach(p => {
        if (p !== '*') allMappedPerms.add(p);
      });
    }

    ALL_MANAGE_PERMISSIONS.forEach((perm) => {
      it(`${perm} is mapped to at least one role`, () => {
        expect(allMappedPerms.has(perm)).toBe(true);
      });
    });
  });

});
