import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    const { id } = await params;
    const invoice = await db.invoice.findFirst({
      where: { id },
      include: {
        organization: true,
        subscription: { include: { plan: true } },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    // SECURITY: Tenant isolation — prevent cross-tenant invoice access
    if (user.role !== 'super_admin' && invoice.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    const org = invoice.organization;
    const plan = invoice.subscription?.plan;
    const dateStr = new Date(invoice.createdAt).toLocaleDateString('en-AE', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const dueDateStr = new Date(invoice.dueDate).toLocaleDateString('en-AE', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; padding: 40px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  .brand { font-size: 28px; font-weight: 800; color: #059669; letter-spacing: -0.5px; }
  .brand-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
  .invoice-label { font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px; }
  .invoice-title { font-size: 32px; font-weight: 700; color: #059669; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 36px; }
  .info-block h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; margin-bottom: 8px; }
  .info-block p { font-size: 13px; color: #334155; line-height: 1.6; }
  .info-block .value { font-weight: 600; color: #0f172a; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
  thead th { background: #f8fafc; padding: 12px 16px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
  tbody td { padding: 14px 16px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
  .totals { display: flex; justify-content: flex-end; margin-bottom: 36px; }
  .totals-table { width: 280px; }
  .totals-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; }
  .totals-row.total { border-top: 2px solid #e2e8f0; padding-top: 12px; margin-top: 4px; font-size: 18px; font-weight: 700; color: #059669; }
  .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
  .status-paid { background: #dcfce7; color: #166534; }
  .status-pending { background: #fef3c7; color: #92400e; }
  .status-overdue { background: #fee2e2; color: #991b1b; }
  .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #e2e8f0; text-align: center; }
  .footer p { font-size: 11px; color: #94a3b8; line-height: 1.8; }
  .footer .brand-mark { color: #059669; font-weight: 600; }
</style></head><body>
  <div class="header">
    <div>
      <div class="brand">RTR 360</div>
      <div class="brand-sub">Fleet Technology &amp; Management Platform</div>
      <div style="margin-top: 8px; font-size: 12px; color: #64748b;">
        Dubai Internet City, Building 12<br/>
        Dubai, UAE | +971-4-123-4567<br/>
        info@rtr.ae | TRN: 100000000000003
      </div>
    </div>
    <div style="text-align: right;">
      <div class="invoice-label">Invoice</div>
      <div class="invoice-title">${invoice.invoiceNumber}</div>
      <div style="margin-top: 12px;"><span class="status-badge status-${invoice.status}">${invoice.status}</span></div>
    </div>
  </div>
  <div class="info-grid">
    <div class="info-block">
      <h3>Bill To</h3>
      <p><span class="value">${org.name}</span><br/>${org.address ? org.address + '<br/>' : ''}${org.city ? org.city + ', ' : ''}${org.emirate ? org.emirate + ', UAE' : ''}<br/>${org.email ? org.email + '<br/>' : ''}${org.phone || ''}</p>
    </div>
    <div class="info-block">
      <h3>Invoice Details</h3>
      <p><span class="value">Issue Date:</span> ${dateStr}<br/><span class="value">Due Date:</span> ${dueDateStr}<br/><span class="value">Currency:</span> AED<br/>${plan ? `<span class="value">Plan:</span> ${plan.name}<br/>` : ''}${invoice.subscription ? `<span class="value">Vehicles:</span> ${invoice.subscription.vehicleCount}<br/>` : ''}${invoice.paidAt ? `<span class="value">Paid On:</span> ${new Date(invoice.paidAt).toLocaleDateString('en-AE')}` : ''}</p>
    </div>
  </div>
  <table><thead><tr><th>Description</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Unit Price</th><th style="text-align:right;">Amount (AED)</th></tr></thead><tbody>
    <tr><td>${plan ? plan.name + ' Plan Subscription' : 'Fleet Management Subscription'}<br/><span style="font-size:11px;color:#94a3b8;">Monthly subscription fee</span></td><td style="text-align:right;">${invoice.subscription?.vehicleCount || 1}</td><td style="text-align:right;">${(Number(invoice.amount) / (invoice.subscription?.vehicleCount || 1)).toFixed(2)}</td><td style="text-align:right;font-weight:600;">${Number(invoice.amount).toFixed(2)}</td></tr>
  </tbody></table>
  <div class="totals"><div class="totals-table">
    <div class="totals-row"><span>Subtotal</span><span>AED ${Number(invoice.amount).toFixed(2)}</span></div>
    <div class="totals-row"><span>VAT (5%)</span><span>AED ${Number(invoice.tax).toFixed(2)}</span></div>
    <div class="totals-row total"><span>Total</span><span>AED ${Number(invoice.total).toFixed(2)}</span></div>
  </div></div>
  <div class="footer"><p>Thank you for your business.<br/>Payment via bank transfer to: RTR Technology Solutions LLC<br/>Bank: Emirates NBD | IBAN: AE07 0331 2345 6789 0123 456 | SWIFT: EBILAEAD<br/><span class="brand-mark">Powered by Mianx.ai</span></p></div>
</body></html>`;

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html',
        'Content-Disposition': `inline; filename="${invoice.invoiceNumber}.html"`,
      },
    });
  } catch (error) {
    logger.error('Invoice PDF error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
