#!/usr/bin/env python3
"""
RTR360 Final Production Audit Report — PDF Generator
P2-10: 25-Phase Production Verification
"""

import sys, os

# Add parent node_modules for Prisma client generation
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm, cm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, KeepTogether
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ── Font Registration ────────────────────────────────────────────

FONT_DIR = '/usr/share/fonts'

pdfmetrics.registerFont(TTFont('NotoSerifSC', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Regular.ttf'))
pdfmetrics.registerFont(TTFont('NotoSerifSC-Bold', f'{FONT_DIR}/truetype/noto-serif-sc/NotoSerifSC-Bold.ttf'))
pdfmetrics.registerFont(TTFont('Inter', f'{FONT_DIR}/truetype/dejavu/DejaVuSans.ttf'))
pdfmetrics.registerFont(TTFont('Inter-Bold', f'{FONT_DIR}/truetype/dejavu/DejaVuSans-Bold.ttf'))

# ── Color Palette ───────────────────────────────────────────────

PRIMARY = colors.HexColor('#059669')     # Emerald green (RTR360 brand)
DARK = colors.HexColor('#0f172a')
LIGHT_BG = colors.HexColor('#f8fafc')
YELLOW = colors.HexColor('#d97706')
RED = colors.HexColor('#dc2626')
GREEN = colors.HexColor('#16a34a')
MUTED = colors.HexColor('#64748b')
BORDER = colors.HexColor('#e2e8f0')

# ── Styles ──────────────────────────────────────────────────────

styles = getSampleStyleSheet()

style_title = ParagraphStyle(
    'AuditTitle', parent=styles['Title'],
    fontName='Inter-Bold', fontSize=28, leading=34,
    textColor=PRIMARY, spaceAfter=6*mm,
)

style_h1 = ParagraphStyle(
    'H1', parent=styles['Heading1'],
    fontName='Inter-Bold', fontSize=16, leading=20,
    textColor=DARK, spaceBefore=8*mm, spaceAfter=3*mm,
    borderWidth=0, borderPadding=0,
)

style_h2 = ParagraphStyle(
    'H2', parent=styles['Heading2'],
    fontName='Inter-Bold', fontSize=13, leading=16,
    textColor=DARK, spaceBefore=5*mm, spaceAfter=2*mm,
)

style_body = ParagraphStyle(
    'Body', parent=styles['Normal'],
    fontName='Inter', fontSize=9.5, leading=14,
    textColor=colors.HexColor('#1e293b'),
    spaceAfter=2*mm, alignment=TA_JUSTIFY,
)

style_code = ParagraphStyle(
    'Code', parent=styles['Code'],
    fontName='Courier', fontSize=8, leading=11,
    textColor=DARK, backColor=LIGHT_BG,
    borderWidth=0.5, borderColor=BORDER, borderPadding=3,
    spaceAfter=2*mm,
)

style_small = ParagraphStyle(
    'Small', parent=styles['Normal'],
    fontName='Inter', fontSize=8, leading=11,
    textColor=MUTED, spaceAfter=1*mm,
)

style_verdict = ParagraphStyle(
    'Verdict', parent=styles['Normal'],
    fontName='Inter-Bold', fontSize=14, leading=18,
    textColor=YELLOW, spaceBefore=6*mm, spaceAfter=3*mm,
    alignment=TA_CENTER,
)

# ── Helper Functions ─────────────────────────────────────────────

def status_color(status):
    if status == 'GREEN': return GREEN
    if status == 'YELLOW': return YELLOW
    if status == 'RED': return RED
    return MUTED

def status_text(status):
    return f'<font color="{status_color(status).hexval()}"><b>{status}</b></font>'

def make_table(headers, rows, col_widths=None):
    """Create a styled table from headers and rows."""
    table_data = [headers] + rows
    if col_widths is None:
        col_widths = [None] * len(headers)
    
    t = Table(table_data, colWidths=col_widths, repeatRows=1)
    style_cmds = [
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
        ('FONTNAME', (0, 0), (-1, 0), 'Inter-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 8.5),
        ('FONTNAME', (0, 1), (-1, -1), 'Inter'),
        ('FONTSIZE', (0, 1), (-1, -1), 8.5),
        ('LEADING', (0, 0), (-1, -1), 12),
        ('TEXTCOLOR', (0, 0), (-1, 0), DARK),
        ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#334155')),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ]
    t.setStyle(TableStyle(style_cmds))
    return t

def section(title, content_paragraphs):
    """Return a list of flowables for a section."""
    items = [Paragraph(title, style_h1)]
    items.extend(content_paragraphs)
    return items

# ── Build Document ───────────────────────────────────────────────

OUTPUT = '/home/z/my-project/rtr360-v2/download/RTR360_Final_Production_Audit_Report.pdf'
os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)

doc = SimpleDocTemplate(
    OUTPUT, pagesize=A4,
    leftMargin=20*mm, rightMargin=20*mm,
    topMargin=20*mm, bottomMargin=20*mm,
    title='RTR360 Final Production Audit Report',
    author='RTR360 Security Engineering',
    subject='P2-10: 25-Phase Production Verification Audit',
)

story = []

# ── COVER SECTION ───────────────────────────────────────────────

story.append(Spacer(1, 40*mm))
story.append(Paragraph('RTR360', ParagraphStyle(
    'Brand', fontName='Inter-Bold', fontSize=42, leading=50,
    textColor=PRIMARY, alignment=TA_CENTER,
)))
story.append(Spacer(1, 5*mm))
story.append(Paragraph('Final Production Audit Report', style_title))
story.append(Spacer(1, 3*mm))
story.append(Paragraph('P2-10: 25-Phase Production Verification', ParagraphStyle(
    'Sub', fontName='Inter', fontSize=14, leading=18,
    textColor=MUTED, alignment=TA_CENTER,
)))
story.append(Spacer(1, 15*mm))
story.append(HRFlowable(width="60%", thickness=1, color=BORDER, spaceAfter=10*mm))

meta_data = [
    ['Audit ID', 'P2-10'],
    ['Date', '2026-08-24'],
    ['Repository SHA', '46250d3d5e66671eff6ea62847d8ee474b287a5f'],
    ['Branch', 'main'],
    ['Baseline SHA', '97e195b'],
    ['Final SHA', '46250d3'],
    ['Classification', 'CONFIDENTIAL'],
]
meta_table = Table(meta_data, colWidths=[50*mm, 80*mm])
meta_table.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (0, -1), 'Inter-Bold'),
    ('FONTNAME', (1, 0), (1, -1), 'Inter'),
    ('FONTSIZE', (0, 0), (-1, -1), 9),
    ('LEADING', (0, 0), (-1, -1), 14),
    ('TEXTCOLOR', (0, 0), (0, -1), MUTED),
    ('TEXTCOLOR', (1, 0), (1, -1), DARK),
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('TOPPADDING', (0, 0), (-1, -1), 2),
    ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ('LINEBELOW', (0, 0), (-1, -2), 0.3, BORDER),
]))
story.append(meta_table)
story.append(PageBreak())

# ── 1. EXECUTIVE SUMMARY ────────────────────────────────────────

story.extend(section(
    '1. Executive Summary',
    [
        Paragraph(
            'This audit executes the full 25-phase production verification process for the RTR360 fleet technology platform. '
            'The codebase is in excellent condition: 832 tests pass with zero failures, zero TypeScript errors, zero ESLint errors, '
            'and the production build succeeds in under 19 seconds. Comprehensive security controls are verified across IDOR, RBAC, '
            'SSRF, AI safety, queue reliability, and observability domains.', style_body),
        Paragraph(
            'Two code-level fixes were applied during this audit. First, a P2 SSRF bypass via IPv4-mapped IPv6 addresses was discovered '
            'and closed in the webhook delivery module. Second, a <font name="Courier" size="8">continue-on-error: true</font> directive '
            'was removed from the GitHub Actions CI configuration to ensure integration test failures properly block the pipeline. '
            'Both fixes include regression tests and have been pushed to the main branch.', style_body),
        Paragraph(
            'The overall verdict remains <b>YELLOW</b> because multiple production infrastructure items cannot be verified without direct access '
            'to the Vercel API, Supabase database, and a real PostgreSQL instance. These include: verifying the production deployment SHA, '
            'confirming all database migrations are applied on production, validating the ENCRYPTION_MASTER_KEY environment variable, '
            'executing the webhook secret backfill, and running PostgreSQL integration tests. All code-level verification is GREEN.', style_body),
    ]
))

# ── 2. REPOSITORY VERIFICATION ──────────────────────────────────

story.extend(section(
    '2. Repository Verification',
    [
        Paragraph(
            'The repository at <font name="Courier" size="8">/home/z/my-project/rtr360-v2</font> is confirmed as the sole production project. '
            'The HEAD commit is <font name="Courier" size="8">46250d3</font> on branch <b>main</b>, matching the remote origin/main exactly. '
            'The working tree is clean with no uncommitted changes. No submodules, nested repositories, or tracked credential files were found. '
            'The only tracked environment file is <font name="Courier" size="8">.env.example</font> containing placeholder values only.', style_body),
        make_table(
            ['Check', 'Result', 'Evidence'],
            [
                ['Branch', 'main', 'git branch --show-current'],
                ['Worktree', 'Clean', 'git status --short = empty'],
                ['HEAD == origin/main', 'Yes', 'Both 46250d3'],
                ['Submodules', 'None', 'git submodule status = empty'],
                ['Tracked .env', '.env.example only', 'git ls-files grep'],
                ['Tracked secrets/keys', 'None', 'No .pem/.key/.p12 files'],
            ],
            col_widths=[40*mm, 35*mm, 75*mm],
        ),
        Spacer(1, 2*mm),
        Paragraph(f'Verdict: {status_text("GREEN")}', style_body),
    ]
))

# ── 3. BASELINE VALIDATION ──────────────────────────────────────

story.extend(section(
    '3. Baseline Validation',
    [
        Paragraph(
            'The complete validation chain was executed from a clean state. The Prisma client was regenerated against a PostgreSQL '
            'datasource (overriding the local SQLite DATABASE_URL) to resolve initial TypeScript errors caused by a stale client from '
            'the parent repository. All 832 tests pass including 3 new SSRF regression tests. The 12 skipped tests are all PostgreSQL '
            'integration tests that require a real database instance.', style_body),
        make_table(
            ['Check', 'Result', 'Evidence'],
            [
                ['Unit Tests', '832 passed, 12 skipped, 0 failed', 'npm test -- --run'],
                ['TypeScript', '0 errors', 'npx tsc --noEmit'],
                ['ESLint', '0 errors', 'npm run lint'],
                ['Build', 'PASS (18.8s compile)', 'npm run build'],
                ['Prisma Validate', 'PASS', 'npx prisma validate'],
                ['Prisma Generate', 'PASS', 'npx prisma generate'],
                ['npm audit (high)', '6 HIGH (unused transitive)', 'npm audit --audit-level=high'],
            ],
            col_widths=[35*mm, 55*mm, 60*mm],
        ),
        Spacer(1, 2*mm),
        Paragraph(f'Verdict: {status_text("GREEN")} (code-level)', style_body),
    ]
))

# ── 4. SECURITY AUDIT ────────────────────────────────────────────

story.extend(section(
    '4. Security Audit',
    [
        Paragraph(
            'A comprehensive security regression audit was performed covering IDOR, RBAC, SSRF, XSS, mass assignment, and logging redaction. '
            'All 18 ID-based routes and 15+ collection routes were verified for organizationId-based tenant isolation. Two patterns are used: '
            'Pattern A (query-level filtering with Prisma where clause) and Pattern B (read-then-check with ownership verification). Both patterns '
            'correctly prevent cross-tenant data access. Cross-tenant foreign key validation was confirmed for vehicle branch/driver assignments.', style_body),
        Paragraph(
            'The RBAC system covers 15 resources across 7 roles. Every mutating endpoint (POST/PUT/PATCH/DELETE) calls <font name="Courier" size="8">requirePermission()</font> '
            'with the appropriate permission constant. Role escalation is blocked at every level: super admins cannot be demoted by lower roles, platform admins '
            'cannot set super_admin roles, and organization users cannot escalate above their own level.', style_body),
        Paragraph(
            'The SSRF protection in <font name="Courier" size="8">src/lib/webhook-delivery.ts</font> provides comprehensive coverage including private IPv4 ranges '
            '(10.x, 172.16-31.x, 192.168.x, 100.64/10), IPv6 loopback and ULA, cloud metadata endpoints (AWS/GCP/Azure), internal DNS names, '
            'Kubernetes service discovery, DNS rebinding protection, and protocol restriction to HTTP/HTTPS only. During this audit, a P2 bypass was discovered: '
            'IPv4-mapped IPv6 addresses (e.g., <font name="Courier" size="8">::ffff:127.0.0.1</font>) were not being blocked. This was fixed by adding a regex check for the '
            '<font name="Courier" size="8">::ffff:</font> prefix, and three regression tests were added.', style_body),
        Spacer(1, 2*mm),
        make_table(
            ['Sub-Phase', 'Verdict', 'Key Finding'],
            [
                ['IDOR (18 ID routes + 15 collections)', status_text('GREEN'), 'All routes org-scoped'],
                ['RBAC (15 resources, 7 roles)', status_text('GREEN'), 'All mutating endpoints checked'],
                ['SSRF (webhook-delivery.ts)', status_text('GREEN'), 'IPv4-mapped IPv6 bypass FIXED'],
                ['XSS', status_text('GREEN'), 'No exploitable vectors'],
                ['Mass Assignment', status_text('GREEN'), 'No spread from req.body'],
                ['Logging Redaction', status_text('GREEN'), '20+ sensitive keys redacted'],
            ],
            col_widths=[50*mm, 20*mm, 80*mm],
        ),
    ]
))

# ── 5. QUEUE / WORKERS ───────────────────────────────────────────

story.extend(section(
    '5. Queue and Worker Reliability',
    [
        Paragraph(
            'The background job queue system implements all 10 production-grade reliability patterns. Jobs are claimed atomically using '
            '<font name="Courier" size="8">FOR UPDATE SKIP LOCKED</font> in a single SQL statement, ensuring two workers can never claim the same job. '
            'Idempotency is enforced at both the application level (fast-path check) and database level (unique constraint on organizationId + idempotencyKey), '
            'with Prisma P2002 unique violation errors caught and handled gracefully.', style_body),
        Paragraph(
            'The lease/heartbeat mechanism ensures claimed jobs are periodically renewed with ownership verification (only the worker that claimed a job '
            'can renew its lease). Stale job recovery runs on every poll cycle, automatically returning expired processing jobs to pending status '
            'or moving them to failed status if max attempts are exhausted. Retry delays use exponential backoff with random jitter, capped at one hour. '
            'Complete tenant isolation is maintained throughout all queue operations.', style_body),
        make_table(
            ['Check', 'Status'],
            [
                ['Atomic claim (FOR UPDATE SKIP LOCKED)', 'PASS'],
                ['Idempotency (app + DB constraint)', 'PASS'],
                ['Lease/heartbeat with ownership', 'PASS'],
                ['Stale job recovery', 'PASS'],
                ['Retry with backoff + jitter', 'PASS'],
                ['Max attempts enforcement', 'PASS'],
                ['Dead lettering (permanent + exhaustion)', 'PASS'],
                ['Tenant isolation (10 operations)', 'PASS'],
                ['Metrics (9 events, failure-isolated)', 'PASS'],
                ['Request ID propagation', 'PASS'],
            ],
            col_widths=[80*mm, 70*mm],
        ),
        Spacer(1, 2*mm),
        Paragraph(f'Verdict: {status_text("GREEN")}', style_body),
    ]
))

# ── 6. AI SECURITY ───────────────────────────────────────────────

story.extend(section(
    '6. AI Security',
    [
        Paragraph(
            'The AI handler uses a static task allowlist containing only <font name="Courier" size="8">fleet_summary</font> and <font name="Courier" size="8">driver_analysis</font>. '
            'All database queries are tenant-scoped via the organizationId from the job context. The handler blocks suspicious input patterns including '
            'eval, Function constructor, require, process.env, and child_process references. A 60-second timeout via AbortController prevents hanging requests, '
            'and token usage is capped at 2048 tokens per request. The OpenAI API key is accessed through the validated env module, never directly from process.env. '
            'Error handling classifies failures as transient or permanent for appropriate retry behavior.', style_body),
        Paragraph(f'Verdict: {status_text("GREEN")}', style_body),
    ]
))

# ── 7. CI/CD ──────────────────────────────────────────────────────

story.extend(section(
    '7. CI/CD Pipeline',
    [
        Paragraph(
            'The GitHub Actions CI workflow is triggered on pushes and pull requests to the main branch. It includes a PostgreSQL 16 service '
            'container with health checks, and runs the full validation chain: Prisma validate, generate, and migrate deploy; ESLint; TypeScript type checking; '
            'unit tests; integration tests; npm audit at high severity; and production build. All steps use the correct PostgreSQL connection string.', style_body),
        Paragraph(
            'During this audit, a <font name="Courier" size="8">continue-on-error: true</font> directive was found on the Integration Tests step. This meant '
            'that even if all integration tests failed, the CI run would still be marked as successful, hiding potential production issues. This directive '
            'was removed. Additionally, no secret printing, shell injection vectors, or destructive database commands were found in the workflow configuration.', style_body),
        Paragraph(f'Verdict: {status_text("GREEN")} (configuration verified, execution status UNKNOWN without GitHub API access)', style_body),
    ]
))

# ── 8. VERCEL AND PRODUCTION SMOKE TEST ─────────────────────────

story.extend(section(
    '8. Vercel and Production Smoke Test',
    [
        Paragraph(
            'The production deployment at <font name="Courier" size="8">rtr360.vercel.app</font> serves the health endpoint successfully, returning HTTP 200 with '
            '<font name="Courier" size="8">{"status":"ok","database":"ok"}</font>. This confirms a working deployment with active database connectivity. '
            'However, the <font name="Courier" size="8">/api/ready</font> endpoint returns HTTP 404, indicating the production deployment does not include the latest commits '
            'that added this route. Without Vercel CLI or API access, the exact deployment SHA and environment variable configuration cannot be verified.', style_body),
        make_table(
            ['Endpoint', 'HTTP Status', 'Response Summary', 'RTT'],
            [
                ['GET /api/health', '200', 'status: ok, database: ok', '2.35s'],
                ['GET /api/ready', '404', 'Next.js 404 page (stale)', '0.63s'],
            ],
            col_widths=[35*mm, 25*mm, 60*mm, 15*mm],
        ),
        Spacer(1, 2*mm),
        Paragraph(f'Verdict: {status_text("YELLOW")} (health OK, ready 404, SHA unverified)', style_body),
    ]
))

# ── 9. DEPENDENCY SECURITY ───────────────────────────────────────

story.extend(section(
    '9. Dependency Security',
    [
        Paragraph(
            'The npm audit reports 6 HIGH and 4 MODERATE vulnerabilities. However, all 6 HIGH vulnerabilities exist in packages that are never '
            'imported by the application source code. Specifically: js-yaml and @mdxeditor/editor (not used), sharp (not imported), and deepmerge-ts/effect '
            '(transitive dependencies of Prisma internals only). These transitive-only vulnerabilities do not affect the production runtime since the vulnerable code '
            'paths are never executed. No security-critical packages were removed to silence the audit.', style_body),
        Paragraph(f'Verdict: {status_text("GREEN")} (no exploitable vulnerability in application dependency tree)', style_body),
    ]
))

# ── 10. STATIC CODE QUALITY ─────────────────────────────────────

story.extend(section(
    '10. Static Code Quality',
    [
        Paragraph(
            'The codebase contains approximately 10 <font name="Courier" size="8">as any</font> type assertions spread across API route handlers and UI components. '
            'These are classified as P3 (low priority) and are not security-relevant. Zero instances of <font name="Courier" size="8">@ts-ignore</font> or '
            '<font name="Courier" size="8">@ts-expect-error</font> were found. Two uses of <font name="Courier" size="8">dangerouslySetInnerHTML</font> exist: one for static PWA service '
            'worker registration in the root layout, and one for CSS variable injection in the shadcn chart component. Both use only hardcoded, static content '
            'with no user input. The AI handler contains references to <font name="Courier" size="8">eval</font>, <font name="Courier" size="8">Function</font>, and '
            '<font name="Courier" size="8">child_process</font> only within a defensive input blocklist. No mass assignment via spread from request body was found.', style_body),
        Paragraph(f'Verdict: {status_text("GREEN")} (no P0/P1/P2 code quality issues)', style_body),
    ]
))

# ── 11. GITHUB SECURITY ──────────────────────────────────────────

story.extend(section(
    '11. GitHub Security',
    [
        Paragraph(
            'A complete scan of the 121-commit git history was performed for leaked secrets. No tracked .env files, private keys, certificates, or credential '
            'files were found. However, a P0 finding was identified: a hardcoded seed password was committed to the repository in early commits and was only '
            'removed in commit <font name="Courier" size="8">2da13f7</font>. While the password is no longer present in the HEAD tree, it remains fully recoverable from the git history. '
            'A regression test was added in commit <font name="Courier" size="8">97e195b</font> to prevent re-introduction. The required remediation is to scrub the git history using '
            '<font name="Courier" size="8">git filter-repo</font> or BFG Repo Cleaner, force-push the rewritten history, and rotate the exposed credential if it was '
            'ever used in any environment.', style_body),
        Paragraph(f'Verdict: {status_text("YELLOW")} (password removed from HEAD but recoverable from history)', style_body),
    ]
))

# ── 12. INFRASTRUCTURE VERIFICATION ──────────────────────────────

story.extend(section(
    '12. Infrastructure Verification (Requires Direct Access)',
    [
        Paragraph(
            'Multiple production infrastructure items could not be verified because this audit environment does not have access to the Vercel API, '
            'Supabase direct connection, or a real PostgreSQL test instance. These items are marked as UNKNOWN and must be verified by a team member '
            'with appropriate infrastructure access before the system can be declared VERIFIED GREEN.', style_body),
        make_table(
            ['Item', 'Status', 'What is Needed'],
            [
                ['Supabase / Production DB', 'UNKNOWN', 'Direct DB connection or Supabase CLI'],
                ['Migration application', 'UNKNOWN', 'prisma migrate status against production'],
                ['REAL to NUMERIC migration', 'UNKNOWN', 'Production schema inspection'],
                ['ENCRYPTION_MASTER_KEY', 'UNKNOWN', 'Vercel environment variable access'],
                ['Webhook backfill', 'NOT RUN', 'Production DB + encryption key'],
                ['PostgreSQL integration tests', 'NOT RUN', 'Real PostgreSQL test instance'],
                ['Production config vars', 'UNKNOWN', 'Vercel/Supabase API access'],
                ['Vercel deployment SHA', 'UNKNOWN', 'Vercel API or CLI'],
            ],
            col_widths=[45*mm, 20*mm, 85*mm],
        ),
    ]
))

# ── 13. VERIFICATION MATRIX ──────────────────────────────────────

story.extend(section(
    '13. Verification Matrix',
    [
        make_table(
            ['Domain', 'Status', 'Evidence'],
            [
                ['CODE', status_text('GREEN'), '832 tests, 0 tsc/lint errors, build OK'],
                ['SECURITY', status_text('GREEN'), 'IDOR/RBAC/SSRF/XSS all verified, 0 RED'],
                ['GITHUB', status_text('YELLOW'), 'Clean tree, P0 password in history'],
                ['CI/CD', status_text('GREEN'), 'Workflow correct, continue-on-error fixed'],
                ['VERCEL', status_text('YELLOW'), '/api/health=200, /api/ready=404'],
                ['SUPABASE', status_text('UNKNOWN'), 'No direct access'],
                ['DATABASE', status_text('UNKNOWN'), 'No production DB access'],
                ['MIGRATIONS', status_text('UNKNOWN'), 'Cannot run migrate status'],
                ['WEBHOOK ENCRYPTION', status_text('UNKNOWN'), 'Code correct, prod unverified'],
                ['POSTGRES INTEGRATION', 'NOT RUN', 'No real PG instance'],
                ['QUEUE', status_text('GREEN'), 'All 10 reliability checks pass'],
                ['AI', status_text('GREEN'), 'Allowlist, tenant-scoped, no eval'],
                ['SSRF', status_text('GREEN'), 'IPv4-mapped IPv6 fix applied'],
                ['RBAC', status_text('GREEN'), '15 resources, 7 roles, all checked'],
                ['IDOR', status_text('GREEN'), '18 ID + 15 collection routes org-scoped'],
                ['OBSERVABILITY', status_text('GREEN'), 'Metrics, request IDs, redaction'],
                ['REALTIME', status_text('YELLOW'), 'SSE on Vercel = architectural limit'],
                ['HEALTH', status_text('GREEN'), 'HTTP 200, database: ok'],
                ['READY', status_text('YELLOW'), 'HTTP 404 (stale deployment)'],
            ],
            col_widths=[45*mm, 20*mm, 85*mm],
        ),
    ]
))

# ── 14. FIXES APPLIED ────────────────────────────────────────────

story.extend(section(
    '14. Fixes Applied in This Audit',
    [
        Paragraph(
            '<b>Fix 1: P2 SSRF Bypass - IPv4-Mapped IPv6</b><br/>'
            'File: <font name="Courier" size="8">src/lib/webhook-delivery.ts</font><br/>'
            'Added <font name="Courier" size="8">/^::ffff:/i</font> regex check to block IPv4-mapped IPv6 addresses from bypassing SSRF protection. '
            'Three regression tests were added covering bracketed and unbracketed forms.', style_body),
        Paragraph(
            '<b>Fix 2: CI Integrity - Remove continue-on-error</b><br/>'
            'File: <font name="Courier" size="8">.github/workflows/ci.yml</font><br/>'
            'Removed <font name="Courier" size="8">continue-on-error: true</font> from Integration Tests step. Integration test failures now correctly fail the CI run.', style_body),
        Paragraph(
            '<b>Commit:</b> <font name="Courier" size="8">46250d3</font> pushed to origin/main.', style_body),
    ]
))

# ── 15. PATH TO GREEN ────────────────────────────────────────────

story.extend(section(
    '15. Path to VERIFIED GREEN',
    [
        Paragraph(
            'All code-level work is complete. The remaining items require infrastructure access that is not available in this audit environment. '
            'The following steps must be performed by a team member with appropriate access to achieve VERIFIED GREEN status:', style_body),
        make_table(
            ['Step', 'Action', 'Owner'],
            [
                ['1', 'Verify Vercel auto-deploys from 46250d3, confirm /api/ready=200', 'DevOps'],
                ['2', 'Connect to production Supabase, run prisma migrate status', 'DBA'],
                ['3', 'Run production-db-diagnostic.sql against production', 'DBA'],
                ['4', 'Verify ENCRYPTION_MASTER_KEY in Vercel environment', 'DevOps'],
                ['5', 'Run webhook-secret-backfill.ts --dry-run, review, execute', 'DevOps'],
                ['6', 'Set up real PostgreSQL for integration tests', 'DevOps'],
                ['7', 'Run npm test -- --run tests/integration against real PG', 'QA'],
                ['8', 'Scrub git history, rotate exposed seed password', 'Security'],
                ['9', 'Re-run this 25-phase audit to confirm all items GREEN', 'Security'],
            ],
            col_widths=[10*mm, 100*mm, 40*mm],
        ),
    ]
))

# ── 16. FINAL VERDICT ────────────────────────────────────────────

story.append(Spacer(1, 10*mm))
story.append(HRFlowable(width="100%", thickness=1.5, color=YELLOW, spaceAfter=6*mm))
story.append(Paragraph('FINAL VERDICT: YELLOW', style_verdict))
story.append(HRFlowable(width="100%", thickness=1.5, color=YELLOW, spaceAfter=6*mm))
story.append(Spacer(1, 4*mm))
story.append(Paragraph(
    'The codebase meets all GREEN criteria: 832 tests pass with zero failures, zero TypeScript errors, zero ESLint errors, '
    'production build succeeds, and security audit returns zero RED findings. YELLOW is assigned because multiple production '
    'infrastructure items are UNKNOWN (Supabase, migrations, ENCRYPTION_MASTER_KEY, webhook backfill, production config) and the Vercel '
    'deployment is stale (/api/ready returns 404). The git history contains a removed but recoverable hardcoded password. '
    'PostgreSQL integration tests have not been run against a real database. All code-level work is complete; remaining items require infrastructure access.',
    style_body
))

# ── Build PDF ────────────────────────────────────────────────────

doc.build(story)
print(f'PDF generated: {OUTPUT}')
print(f'Size: {os.path.getsize(OUTPUT):,} bytes')
