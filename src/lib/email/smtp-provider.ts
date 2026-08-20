/**
 * RTR 360 — SMTP Email Provider
 *
 * Production email provider using nodemailer SMTP transport.
 * Nodemailer must be installed for SMTP delivery to work.
 *
 * Environment variables:
 *   EMAIL_SMTP_HOST     - SMTP server hostname
 *   EMAIL_SMTP_PORT     - SMTP port (default: 587)
 *   EMAIL_SMTP_USER     - SMTP username
 *   EMAIL_SMTP_PASS     - SMTP password (NEVER logged)
 *   EMAIL_FROM_ADDRESS  - From email address
 *   EMAIL_FROM_NAME     - From display name (default: 'RTR 360')
 *
 * Error classification:
 *   - Auth failures (535), mailbox unavailable (550) → permanent
 *   - Network errors, timeouts, 4xx responses → transient
 */

import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import type { EmailProvider, EmailSendResult } from '@/lib/handlers/email-handler';
import type { EmailPayload } from '@/lib/job-types';

// ── Error Classification ────────────────────────────────────────

const PERMANENT_SMTP_CODES = new Set([530, 535, 550, 551, 552, 553, 554]);
const TRANSIENT_NETWORK_PATTERNS = [
  'econnrefused', 'econnreset', 'etimedout', 'enotfound',
  'socket hang up', 'network', 'timeout', 'epipe',
];

function classifySmtpError(error: unknown): Error {
  if (!(error instanceof Error)) {
    return new Error(`[TRANSIENT] Unknown SMTP error: ${String(error)}`);
  }
  const msg = error.message;
  const lower = msg.toLowerCase();

  for (const code of PERMANENT_SMTP_CODES) {
    if (msg.includes(String(code))) {
      return new Error(`[PERMANENT] SMTP ${code}: ${msg.slice(0, 200)}`);
    }
  }

  if (
    lower.includes('invalid credentials') ||
    lower.includes('authentication failed') ||
    lower.includes('auth failed') ||
    lower.includes('login failed') ||
    lower.includes('sender address rejected')
  ) {
    return new Error(`[PERMANENT] ${msg.slice(0, 200)}`);
  }

  for (const pattern of TRANSIENT_NETWORK_PATTERNS) {
    if (lower.includes(pattern)) {
      return new Error(`[TRANSIENT] ${msg.slice(0, 200)}`);
    }
  }

  // 4xx SMTP codes → transient
  const codeMatch = msg.match(/\b(4\d{2})\b/);
  if (codeMatch) {
    return new Error(`[TRANSIENT] SMTP ${codeMatch[1]}: ${msg.slice(0, 200)}`);
  }

  return new Error(`[TRANSIENT] ${msg.slice(0, 200)}`);
}

// ── Email Content Builders ──────────────────────────────────────

function buildPlainTextBody(payload: EmailPayload): string {
  const lines: string[] = [`Template: ${payload.templateId}`];
  if (payload.templateData && Object.keys(payload.templateData).length > 0) {
    lines.push('');
    lines.push('Template Data:');
    for (const [key, value] of Object.entries(payload.templateData)) {
      const strValue = typeof value === 'string' ? value : JSON.stringify(value);
      lines.push(`  ${key}: ${strValue}`);
    }
  }
  return lines.join('\n');
}

function buildHtmlBody(payload: EmailPayload): string {
  const escaped = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  let dataRows = '';
  if (payload.templateData && Object.keys(payload.templateData).length > 0) {
    for (const [key, value] of Object.entries(payload.templateData)) {
      const strValue = typeof value === 'string'
        ? escaped(value)
        : escaped(JSON.stringify(value));
      dataRows += `<tr><td style="padding:4px 8px;font-weight:600">${escaped(key)}</td>` +
        `<td style="padding:4px 8px">${strValue}</td></tr>`;
    }
  }

  return '<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px">' +
    '<div style="border:1px solid #e2e8f0;border-radius:8px;padding:24px">' +
    `<h2 style="color:#059669;margin:0 0 16px">${escaped(payload.subject)}</h2>` +
    `<p>Template: <code>${escaped(payload.templateId)}</code></p>` +
    (dataRows ? `<table style="border-collapse:collapse;width:100%;margin-top:16px"><tbody>${dataRows}</tbody></table>` : '') +
    '</div>' +
    '<p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px">RTR 360 Fleet Management</p>' +
    '</body></html>';
}

// ── SMTP Provider ───────────────────────────────────────────────

const SMTP_TIMEOUT_MS = 30_000;

export class SmtpEmailProvider implements EmailProvider {
  readonly name = 'smtp';
  private readonly host: string;
  private readonly port: number;
  private readonly user: string;
  private readonly pass: string;
  private readonly fromAddress: string;
  private readonly fromName: string;
  private nodemailerAvailable = false;
  private createTransport: ((config: Record<string, unknown>) => {
    sendMail: (opts: Record<string, unknown>, cb: (err: Error | null, info: { messageId: string }) => void) => void;
    close: () => void;
  }) | null = null;

  constructor(options?: {
    host?: string;
    port?: number;
    user?: string;
    pass?: string;
    fromAddress?: string;
    fromName?: string;
  }) {
    this.host = options?.host ?? env.emailSmtpHost;
    this.port = options?.port ?? (env.emailSmtpPort ? parseInt(env.emailSmtpPort, 10) : 587);
    this.user = options?.user ?? env.emailSmtpUser;
    this.pass = options?.pass ?? env.emailSmtpPass;
    this.fromAddress = options?.fromAddress ?? env.emailFromAddress;
    this.fromName = options?.fromName ?? (env.emailFromName || 'RTR 360');

    // Validate required config
    const missing: string[] = [];
    if (!this.host) missing.push('EMAIL_SMTP_HOST');
    if (!this.user) missing.push('EMAIL_SMTP_USER');
    if (!this.pass) missing.push('EMAIL_SMTP_PASS');
    if (!this.fromAddress) missing.push('EMAIL_FROM_ADDRESS');

    if (missing.length > 0) {
      throw new Error(
        `[PERMANENT] SMTP provider missing required configuration: ${missing.join(', ')}`,
      );
    }

    if (isNaN(this.port) || this.port < 1 || this.port > 65535) {
      throw new Error('[PERMANENT] Invalid SMTP port number');
    }

    // Attempt to load nodemailer
    this.loadNodemailer();
  }

  private loadNodemailer(): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- conditional dependency
      const nm = require('nodemailer');
      if (nm && typeof nm.createTransport === 'function') {
        this.createTransport = nm.createTransport;
        this.nodemailerAvailable = true;
        logger.info('email.smtp_nodemailer_loaded', { provider: 'smtp' });
      }
    } catch {
      logger.warn('email.smtp_nodemailer_not_available', {
        event: 'nodemailer_missing',
      });
    }
  }

  async send(payload: EmailPayload): Promise<EmailSendResult> {
    if (!this.nodemailerAvailable || !this.createTransport) {
      throw new Error(
        '[PERMANENT] nodemailer is not installed. Run: npm install nodemailer',
      );
    }

    const fromHeader = this.fromName
      ? `${this.fromName} <${this.fromAddress}>`
      : this.fromAddress;

    const messageId = `smtp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const transport = this.createTransport({
      host: this.host,
      port: this.port,
      secure: this.port === 465,
      auth: { user: this.user, pass: this.pass },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: 10_000,
      socketTimeout: SMTP_TIMEOUT_MS,
    });

    return new Promise<EmailSendResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        transport.close();
        reject(new Error('[TRANSIENT] SMTP send timed out'));
      }, SMTP_TIMEOUT_MS);

      transport.sendMail(
        {
          from: fromHeader,
          to: payload.to,
          subject: payload.subject,
          text: buildPlainTextBody(payload),
          html: buildHtmlBody(payload),
          replyTo: payload.replyTo || undefined,
          headers: {
            'X-Message-Id': messageId,
            'X-RTR360-Source': 'background-job',
          },
        },
        (err, info) => {
          clearTimeout(timeout);
          transport.close();

          if (err) {
            reject(classifySmtpError(err));
            return;
          }

          logger.info('email.smtp_sent', {
            messageId: info.messageId || messageId,
            to: payload.to,
            provider: 'smtp',
          });

          resolve({
            messageId: info.messageId || messageId,
            provider: 'smtp',
          });
        },
      );
    });
  }
}
