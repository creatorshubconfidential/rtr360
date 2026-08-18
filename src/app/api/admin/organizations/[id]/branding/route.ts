
import { db } from '@/lib/db';
import { checkRateLimit } from '@/lib/rate-limit';
import { requireAuth } from '@/lib/auth';

import { requirePermission, ADMIN_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';
import { logAudit, getClientIp } from '@/lib/audit';
interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/admin/organizations/[id]/branding — Get white-label branding
export async function GET(request: Request, context: RouteContext) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: ADMIN_MANAGE
    const permErr = requirePermission(user, ADMIN_MANAGE);
    if (permErr) return permErr;

    const { id } = await context.params;
    const org = await db.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        primaryColor: true,
        accentColor: true,
        customLogo: true,
        favicon: true,
        loginBgImage: true,
        customDomain: true,
        domainVerified: true,
        whiteLabelEnabled: true,
        brandedAppName: true,
        brandedFooter: true,
        hideMianxBranding: true,
      },
    });

    if (!org) return Response.json({ error: 'Organization not found' }, { status: 404 });

    return Response.json({ data: org });
  } catch (error: unknown) {
    logger.error('Branding get error', { error });
    return Response.json({ error: 'Failed to fetch branding' }, { status: 500 });
  }
}

// PUT /api/admin/organizations/[id]/branding — Update white-label branding
export async function PUT(request: Request, context: RouteContext) {
  const rl = await checkRateLimit(request, 'api');
  if (rl) return rl;
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // RBAC: ADMIN_MANAGE
    const permErr = requirePermission(user, ADMIN_MANAGE);
    if (permErr) return permErr;

    const { id } = await context.params;
    const org = await db.organization.findUnique({ where: { id } });
    if (!org) return Response.json({ error: 'Organization not found' }, { status: 404 });

    const body = await request.json();
    const {
      primaryColor,
      accentColor,
      customLogo,
      favicon,
      loginBgImage,
      customDomain,
      whiteLabelEnabled,
      brandedAppName,
      brandedFooter,
      hideMianxBranding,
    } = body;

    const updateData: Record<string, unknown> = {};
    if (primaryColor !== undefined) updateData.primaryColor = primaryColor;
    if (accentColor !== undefined) updateData.accentColor = accentColor;
    if (customLogo !== undefined) updateData.customLogo = customLogo;
    if (favicon !== undefined) updateData.favicon = favicon;
    if (loginBgImage !== undefined) updateData.loginBgImage = loginBgImage;
    if (customDomain !== undefined) updateData.customDomain = customDomain;
    if (whiteLabelEnabled !== undefined) updateData.whiteLabelEnabled = whiteLabelEnabled;
    if (brandedAppName !== undefined) updateData.brandedAppName = brandedAppName;
    if (brandedFooter !== undefined) updateData.brandedFooter = brandedFooter;
    if (hideMianxBranding !== undefined) updateData.hideMianxBranding = hideMianxBranding;

    const updated = await db.organization.update({
      where: { id },
      data: updateData,
    });
        await logAudit({ user, action: 'update', entity: 'Organization', entityId: id, ipAddress: getClientIp(request) });

    return Response.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        primaryColor: updated.primaryColor,
        accentColor: updated.accentColor,
        customLogo: updated.customLogo,
        whiteLabelEnabled: updated.whiteLabelEnabled,
        brandedAppName: updated.brandedAppName,
        brandedFooter: updated.brandedFooter,
        hideMianxBranding: updated.hideMianxBranding,
        customDomain: updated.customDomain,
      },
    });
  } catch (error: unknown) {
    logger.error('Branding update error', { error });
    return Response.json({ error: 'Failed to update branding' }, { status: 500 });
  }
}
