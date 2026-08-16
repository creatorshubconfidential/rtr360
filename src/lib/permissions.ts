/**
 * RTR 360 — RBAC Permission System
 * 
 * Defines fine-grained permissions mapped to roles.
 * Uses a code-based permission map (no DB table needed for now).
 * Call `requirePermission(user, 'vehicles.create')` in route handlers.
 */

import { NextResponse } from 'next/server';
import type { UserSession } from './auth';

// ============================================================
// PERMISSION CONSTANTS
// ============================================================

/**
 * Permission format: `{resource}.{action}`
 * Actions: create, read, update, delete, manage (all actions)
 * Wildcard: `*` means all permissions
 */

// --- Fleet ---
export const VEHICLES_MANAGE = 'vehicles.manage';
export const DRIVERS_MANAGE = 'drivers.manage';
export const DEVICES_MANAGE = 'devices.manage';
export const TRIPS_MANAGE = 'trips.manage';
export const GEOFENCES_MANAGE = 'geofences.manage';
export const MAINTENANCE_MANAGE = 'maintenance.manage';
export const INSTALLATIONS_MANAGE = 'installations.manage';
export const TECHNICIANS_MANAGE = 'technicians.manage';

// --- CRM ---
export const LEADS_MANAGE = 'leads.manage';
export const CONTACTS_MANAGE = 'contacts.manage';
export const QUOTATIONS_MANAGE = 'quotations.manage';
export const CONTRACTS_MANAGE = 'contracts.manage';
export const ACTIVITIES_MANAGE = 'activities.manage';

// --- Billing ---
export const INVOICES_MANAGE = 'invoices.manage';
export const SUBSCRIPTIONS_MANAGE = 'subscriptions.manage';

// --- Operations ---
export const TICKETS_MANAGE = 'tickets.manage';
export const ALERT_RULES_MANAGE = 'alert_rules.manage';

// --- Platform ---
export const USERS_MANAGE = 'users.manage';
export const SETTINGS_MANAGE = 'settings.manage';
export const ADMIN_MANAGE = 'admin.manage';
export const AI_USE = 'ai.use';

// ============================================================
// ROLE → PERMISSION MAP
// ============================================================

/**
 * Each role maps to a set of permission patterns.
 * Patterns can use wildcards:
 *   `*` = all permissions
 *   `vehicles.manage` = all vehicle actions (create/read/update/delete)
 */
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

  viewer: [
    // Read-only role — no manage permissions
  ],
};

// ============================================================
// PERMISSION CHECK FUNCTION
// ============================================================

/**
 * Check if a user's role has a specific permission.
 * Returns true if the user has the permission, false otherwise.
 */
export function hasPermission(role: string, permission: string): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) return false;

  // Super admin wildcard
  if (permissions.includes('*')) return true;

  // Direct match
  if (permissions.includes(permission)) return true;

  return false;
}

/**
 * Middleware helper: Check permission and return error Response if denied.
 * Usage in route handlers:
 *   const permErr = requirePermission(user, 'vehicles.manage');
 *   if (permErr) return permErr;
 */
export function requirePermission(user: UserSession, permission: string): Response | null {
  if (!hasPermission(user.role, permission)) {
    return NextResponse.json(
      { error: 'Insufficient permissions', required: permission, role: user.role },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Get all permissions for a given role. Useful for frontend UI rendering.
 */
export function getPermissionsForRole(role: string): string[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/**
 * Check if a role can manage a specific resource.
 * Convenience wrapper for common pattern.
 */
export function canManage(role: string, resource: string): boolean {
  return hasPermission(role, `${resource}.manage`);
}
