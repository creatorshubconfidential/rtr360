import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { verifySession } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/admin/organizations/[id] — Full org detail
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
      include: {
        branches: { select: { id: true, name: true, emirate: true, address: true, phone: true } },
        users: {
          select: { id: true, name: true, email: true, role: true, status: true, lastLoginAt: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            vehicles: true,
            drivers: true,
            devices: true,
            leads: true,
            contacts: true,
            invoices: true,
            tickets: true,
            contracts: true,
            quotations: true,
            geofences: true,
            alertRules: true,
            alerts: true,
            technicians: true,
            installations: true,
            maintenanceRecords: true,
            subscriptions: true,
            notifications: true,
            documents: true,
            apiKeys: true,
            branches: true,
          },
        },
      },
    });

    if (!org) return Response.json({ error: 'Organization not found' }, { status: 404 });

    // Get invoice totals
    const invoiceStats = await db.invoice.aggregate({
      _sum: { total: true },
      _count: true,
      where: { organizationId: id },
    });
    const paidStats = await db.invoice.aggregate({
      _sum: { total: true },
      where: { organizationId: id, status: 'paid' },
    });
    const overdueStats = await db.invoice.aggregate({
    _sum: { total: true },
    where: { organizationId: id, status: 'overdue' },
  });

    // Get subscription info
    const subscription = await db.subscription.findFirst({
      where: { organizationId: id, status: 'active' },
      include: { plan: true },
    });

    return Response.json({
      data: {
        ...org,
        invoiceStats: {
          totalAmount: invoiceStats._sum.total || 0,
          totalInvoices: invoiceStats._count,
          paidAmount: paidStats._sum.total || 0,
          overdueAmount: overdueStats._sum.total || 0,
        },
        subscription: subscription || null,
        vehicleUtilization: org._count.vehicles > 0 && org.vehicleLimit > 0
          ? Math.round((org._count.vehicles / org.vehicleLimit) * 100)
          : 0,
        userUtilization: org.userLimit > 0
          ? Math.round((org.users.length / org.userLimit) * 100)
          : 0,
      },
    });
  } catch (error: any) {
    console.error('Org detail error:', error);
    return Response.json({ error: 'Failed to fetch organization' }, { status: 500 });
  }
}

// PATCH /api/admin/organizations/[id] — Update org info
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    const session = await verifySession(token || '');
    if (!session || session.role !== 'super_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await request.json();

    const org = await db.organization.findUnique({ where: { id } });
    if (!org) return Response.json({ error: 'Organization not found' }, { status: 404 });

    const { name, tradeName, legalName, email, phone, website, emirate, city, address, status, planName, vehicleLimit, userLimit } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (tradeName !== undefined) updateData.tradeName = tradeName;
    if (legalName !== undefined) updateData.legalName = legalName;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = phone;
    if (website !== undefined) updateData.website = website;
    if (emirate !== undefined) updateData.emirate = emirate;
    if (city !== undefined) updateData.city = city;
    if (address !== undefined) updateData.address = address;
    if (status !== undefined) updateData.status = status;
    if (planName !== undefined) updateData.planName = planName;
    if (vehicleLimit !== undefined) updateData.vehicleLimit = vehicleLimit;
    if (userLimit !== undefined) updateData.userLimit = userLimit;

    const updated = await db.organization.update({
      where: { id },
      data: updateData,
    });

    return Response.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Org update error:', error);
    return Response.json({ error: 'Failed to update organization' }, { status: 500 });
  }
}

// DELETE /api/admin/organizations/[id] — Soft delete (set status inactive)
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    const session = await verifySession(token || '');
    if (!session || session.role !== 'super_admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    const org = await db.organization.findUnique({ where: { id } });
    if (!org) return Response.json({ error: 'Organization not found' }, { status: 404 });

    // Soft delete: deactivate org and all users
    await db.$transaction([
      db.organization.update({
        where: { id },
        data: { status: 'inactive' },
      }),
      db.user.updateMany({
        where: { organizationId: id },
        data: { status: 'inactive' },
      }),
    ]);

    return Response.json({ success: true, message: `Organization "${org.name}" has been deactivated` });
  } catch (error: any) {
    console.error('Org delete error:', error);
    return Response.json({ error: 'Failed to deactivate organization' }, { status: 500 });
  }
}
