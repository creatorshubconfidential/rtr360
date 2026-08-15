import { UserSession } from './auth';

/**
 * Returns a Prisma-compatible where clause that enforces tenant isolation.
 * Super admins bypass the filter (return empty object).
 * Org users MUST have their organizationId applied.
 */
export function getTenantFilter(
  user: UserSession
): Record<string, unknown> {
  if (user.role === 'super_admin') return {};
  if (user.organizationId) return { organizationId: user.organizationId };
  // Non-super_admin user without org — return an impossible filter
  return { organizationId: '__none__' };
}

/**
 * Strict tenant filter that never returns empty — even for super_admin,
 * the caller MUST pass the filter explicitly for data that should be scoped.
 * Use this for routes where super_admin should ALSO be scoped when acting
 * on behalf of an org (e.g., creating entities).
 */
export function getStrictTenantFilter(
  user: UserSession
): Record<string, unknown> {
  if (user.organizationId) return { organizationId: user.organizationId };
  return { organizationId: '__none__' };
}

/**
 * Checks if a resource belongs to the user's organization.
 * Returns true if access is allowed, false otherwise.
 */
export function isTenantAccessible(
  user: UserSession,
  resourceOrgId: string | null
): boolean {
  if (user.role === 'super_admin') return true;
  if (!resourceOrgId) return false;
  return resourceOrgId === user.organizationId;
}
