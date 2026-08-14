import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { verifySession } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/admin/organizations/[id]/branding — Get white-label branding
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    const session = await verifySession(token || '');
    if (!session || session.role !== 'super_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

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
  } catch (error: any) {
    console.error('Branding get error:', error);
    return Response.json({ error: 'Failed to fetch branding' }, { status: 500 });
  }
}

// PUT /api/admin/organizations/[id]/branding — Update white-label branding
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    const session = await verifySession(token || '');
    if (!session || session.role !== 'super_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

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

    const updateData: any = {};
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
  } catch (error: any) {
    console.error('Branding update error:', error);
    return Response.json({ error: 'Failed to update branding' }, { status: 500 });
  }
}
