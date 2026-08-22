import { NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { db } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { requirePermission, INVOICES_MANAGE } from '@/lib/permissions';
import { logger } from '@/lib/logger';

// SECURITY: Strip characters that could cause HTTP header injection in Content-Disposition
function sanitizeFilename(name: string): string {
  return name.replace(/[\r\n"\\]/g, '').trim();
}

// ── Color palette ──────────────────────────────────────────────
const COLORS = {
  primary: '#059669',
  text: '#1e293b',
  muted: '#64748b',
  light: '#94a3b8',
  border: '#e2e8f0',
  rowAlt: '#f8fafc',
  white: '#ffffff',
  paidBg: '#dcfce7',
  paidText: '#166534',
  pendingBg: '#fef3c7',
  pendingText: '#92400e',
  overdueBg: '#fee2e2',
  overdueText: '#991b1b',
} as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, error } = await requireAuth(request);
    if (error) return error;

    // SECURITY: RBAC — only roles with invoices.manage can download invoice PDFs
    const permErr = requirePermission(user, INVOICES_MANAGE);
    if (permErr) return permErr;

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

    // ── Build PDF ────────────────────────────────────────────────
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
    const chunks: Uint8Array[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(new Uint8Array(chunk)));

    const org = invoice.organization;
    const plan = invoice.subscription?.plan;
    const pageW = doc.page.width;
    const margin = 40;
    const contentW = pageW - margin * 2;

    const fmt = (n: number) => n.toFixed(2);
    const fmtDate = (d: Date) =>
      d.toLocaleDateString('en-AE', { year: 'numeric', month: 'long', day: 'numeric' });

    // ── Helper: horizontal rule ──────────────────────────────────
    const hr = (y?: number, color = COLORS.border) => {
      const currentY = y ?? doc.y;
      doc.moveTo(margin, currentY).lineTo(pageW - margin, currentY).strokeColor(color).lineWidth(1).stroke();
      doc.y = currentY + 8;
    };

    // ── Helper: table row ────────────────────────────────────────
    const tableRow = (cols: { text: string; width: number; align?: 'left' | 'right' }[], isHeader = false, isAlt = false) => {
      const startY = doc.y;
      const rowH = 28;

      if (isAlt) {
        doc.rect(margin, startY, contentW, rowH).fill(COLORS.rowAlt);
      }

      let x = margin;
      for (const col of cols) {
        doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(isHeader ? 8.5 : 10)
          .fillColor(isHeader ? COLORS.muted : COLORS.text);
        doc.text(col.text.toUpperCase(), x + 8, startY + (isHeader ? 9 : 8), {
          width: col.width - 16,
          align: col.align ?? 'left',
        });
        x += col.width;
      }
      doc.y = startY + rowH;
    };

    // ── HEADER — Brand + Invoice title ────────────────────────────
    doc.font('Helvetica-Bold').fontSize(24).fillColor(COLORS.primary).text('RTR 360', margin, 40);
    doc.moveDown(0.15);
    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
      .text('Fleet Technology & Management Platform', margin);
    doc.moveDown(0.4);
    doc.fontSize(9).fillColor(COLORS.muted)
      .text('Dubai Internet City, Building 12')
      .text('Dubai, UAE  |  +971-4-123-4567')
      .text('info@rtr.ae  |  TRN: 100000000000003');

    // Invoice number & status — top-right
    const statusColor =
      invoice.status === 'paid' ? COLORS.paidText :
      invoice.status === 'overdue' ? COLORS.overdueText :
      COLORS.pendingText;
    const statusBg =
      invoice.status === 'paid' ? COLORS.paidBg :
      invoice.status === 'overdue' ? COLORS.overdueBg :
      COLORS.pendingBg;

    const labelW = 80;
    const labelX = pageW - margin - labelW;
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.light)
      .text('INVOICE', labelX, 42, { width: labelW, align: 'right' });

    doc.font('Helvetica-Bold').fontSize(20).fillColor(COLORS.primary)
      .text(invoice.invoiceNumber, labelX - 120, 52, { width: 200, align: 'right' });

    // Status badge
    const badgeText = invoice.status.toUpperCase();
    const badgeW = doc.font('Helvetica-Bold').fontSize(8).widthOfString(badgeText) + 20;
    const badgeX = pageW - margin - badgeW;
    const badgeY = 78;
    doc.roundedRect(badgeX, badgeY, badgeW, 18, 9).fill(statusBg);
    doc.fillColor(statusColor).font('Helvetica-Bold').fontSize(8)
      .text(badgeText, badgeX + 10, badgeY + 5, { width: badgeW - 20, align: 'center' });

    doc.y = 120;
    hr();

    // ── INFO GRID — Bill To + Invoice Details ────────────────────
    const leftColX = margin;
    const rightColX = margin + contentW / 2 + 16;

    // Left — Bill To
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.light)
      .text('BILL TO', leftColX, doc.y);
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(COLORS.text).text(org.name, leftColX);
    if (org.address) doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text(org.address, leftColX);
    const cityLine = [org.city, org.emirate, org.country !== 'AE' ? org.country : 'UAE'].filter(Boolean).join(', ');
    if (cityLine) doc.text(cityLine, leftColX);
    if (org.email) doc.text(org.email, leftColX);
    if (org.phone) doc.text(org.phone, leftColX);

    // Right — Invoice Details (positioned absolutely)
    const rightStartY = doc.y - (org.address ? 36 : 24);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.light)
      .text('INVOICE DETAILS', rightColX, rightStartY);
    doc.moveDown(0.3);
    const detailLine = (label: string, value: string) => {
      doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.text)
        .text(`${label}: `, rightColX, doc.y, { continued: true });
      doc.font('Helvetica').fillColor(COLORS.muted).text(value);
      doc.moveDown(0.15);
    };
    detailLine('Issue Date', fmtDate(new Date(invoice.createdAt)));
    detailLine('Due Date', fmtDate(new Date(invoice.dueDate)));
    detailLine('Currency', 'AED');
    if (plan) detailLine('Plan', plan.name);
    if (invoice.subscription) detailLine('Vehicles', String(invoice.subscription.vehicleCount));
    if (invoice.paidAt) detailLine('Paid On', fmtDate(new Date(invoice.paidAt)));

    doc.y = Math.max(doc.y, rightStartY + 80);
    doc.moveDown(0.5);
    hr();

    // ── LINE ITEMS TABLE ──────────────────────────────────────────
    const descW = contentW * 0.5;
    const qtyW = contentW * 0.15;
    const priceW = contentW * 0.17;
    const amtW = contentW * 0.18;

    tableRow([
      { text: 'Description', width: descW },
      { text: 'Qty', width: qtyW, align: 'right' },
      { text: 'Unit Price', width: priceW, align: 'right' },
      { text: 'Amount (AED)', width: amtW, align: 'right' },
    ], true);

    const qty = invoice.subscription?.vehicleCount ?? 1;
    const unitPrice = Number(invoice.amount) / qty;
    const desc = plan ? `${plan.name} Plan Subscription` : 'Fleet Management Subscription';

    tableRow([
      { text: desc, width: descW },
      { text: String(qty), width: qtyW, align: 'right' },
      { text: fmt(unitPrice), width: priceW, align: 'right' },
      { text: fmt(Number(invoice.amount)), width: amtW, align: 'right' },
    ], false, false);

    // Sub-line for description
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.light)
      .text('Monthly subscription fee', margin + 8, doc.y - 20 + 14);
    doc.y += 4;

    hr();

    // ── TOTALS ────────────────────────────────────────────────────
    const totalsX = pageW - margin - 200;
    const totalsW = 200;

    const totalLine = (label: string, value: string, isTotal = false) => {
      doc.font(isTotal ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(isTotal ? 14 : 10)
        .fillColor(isTotal ? COLORS.primary : COLORS.text);
      doc.text(label, totalsX, doc.y, { continued: true, width: totalsW * 0.6, align: 'left' });
      doc.text(value, { width: totalsW * 0.4, align: 'right' });
      doc.moveDown(0.15);
    };

    doc.y += 4;
    totalLine('Subtotal', `AED ${fmt(Number(invoice.amount))}`);
    totalLine('VAT (5%)', `AED ${fmt(Number(invoice.tax))}`);
    hr(totalsX - 8);
    totalLine('Total', `AED ${fmt(Number(invoice.total))}`, true);

    // ── FOOTER ────────────────────────────────────────────────────
    doc.moveDown(2);
    hr();
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted)
      .text('Thank you for your business.', margin, doc.y, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(8)
      .text('Payment via bank transfer to: RTR Technology Solutions LLC', { align: 'center' })
      .text('Bank: Emirates NBD  |  IBAN: AE07 0331 2345 6789 0123 456  |  SWIFT: EBILAEAD', { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(COLORS.primary)
      .text('Powered by Mianx.ai', margin, doc.y, { align: 'center' });

    // ── End document & collect bytes ───────────────────────────────
    doc.end();

    const pdfBytes = await new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    return new NextResponse(new Uint8Array(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${sanitizeFilename(invoice.invoiceNumber)}.pdf"`,
        'Content-Length': String(pdfBytes.length),
      },
    });
  } catch (error) {
    logger.error('Invoice PDF error', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
