/**
 * RTR 360 — Email Job Handler
 *
 * Provider-agnostic email sending handler.
 * Uses a pluggable EmailProvider interface.
 * No real provider credentials in the repository.
 *
 * In production, register a real provider via registerEmailProvider().
 * In development/test, the NoopEmailProvider is used by default.
 */

import { logger } from '@/lib/logger';
import type { ClaimedJob } from '@/lib/queue';
import type { EmailPayload } from '@/lib/job-types';
import { ValidationError } from '@/lib/errors';
import { metrics, METRIC_NAMES } from '@/lib/metrics';

// ── Provider Interface ──────────────────────────────────────────

export interface EmailSendResult {
  messageId?: string;
  provider: string;
}

export interface EmailProvider {
  /** Provider name for logging */
  readonly name: string;
  /** Send an email. Throw on permanent failure. */
  send(payload: EmailPayload): Promise<EmailSendResult>;
}

// ── Noop Provider (default) ──────────────────────────────────────

class NoopEmailProvider implements EmailProvider {
  readonly name = 'noop';
  async send(payload: EmailPayload): Promise<EmailSendResult> {
    logger.info('email.noop_send', {
      to: payload.to,
      subject: payload.subject,
      templateId: payload.templateId,
    });
    return { messageId: `noop-${Date.now()}`, provider: 'noop' };
  }
}

// ── Provider Registry ───────────────────────────────────────────

let emailProvider: EmailProvider = new NoopEmailProvider();

/**
 * Register a real email provider.
 * Call this once at application startup.
 */
export function registerEmailProvider(provider: EmailProvider): void {
  emailProvider = provider;
  logger.info('email.provider_registered', { provider: provider.name });
}

/** Get the current email provider (for testing/diagnostics) */
export function getEmailProvider(): EmailProvider {
  return emailProvider;
}

// ── Handler ──────────────────────────────────────────────────────

const EMAIL_TIMEOUT_MS = 30_000;

/**
 * Email job handler.
 * Validates payload, enforces tenant boundaries, delegates to provider.
 * Timeout-protected to avoid hanging the worker.
 */
export async function handleEmailJob(job: ClaimedJob): Promise<EmailSendResult> {
  const startTime = Date.now();

  // Tenant boundary: email jobs must have an organizationId
  if (!job.organizationId) {
    throw new ValidationError('Email jobs require an organizationId', [
      { field: 'organizationId', message: 'Tenant-scoped job missing organizationId' },
    ]);
  }

  // Validate payload (double-parse — treat DB as untrusted)
  const payload = job.payload as Record<string, unknown>;
  const emailPayload: EmailPayload = {
    to: String(payload.to ?? ''),
    subject: String(payload.subject ?? ''),
    templateId: String(payload.templateId ?? ''),
    templateData: payload.templateData as Record<string, unknown> | undefined,
    replyTo: payload.replyTo !== undefined ? String(payload.replyTo) : undefined,
  };

  // Basic field validation
  if (!emailPayload.to || !emailPayload.to.includes('@')) {
    throw new ValidationError('Invalid email recipient', [
      { field: 'to', message: 'A valid email address is required' },
    ]);
  }
  if (!emailPayload.subject) {
    throw new ValidationError('Email subject is required', [
      { field: 'subject', message: 'Subject cannot be empty' },
    ]);
  }
  if (!emailPayload.templateId) {
    throw new ValidationError('Template ID is required', [
      { field: 'templateId', message: 'A valid template ID is required' },
    ]);
  }

  // Execute with timeout
  const result = await Promise.race([
    emailProvider.send(emailPayload),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Email send timed out')), EMAIL_TIMEOUT_MS)
    ),
  ]);

  const durationMs = Date.now() - startTime;
  logger.info('email.sent', {
    jobId: job.id,
    jobType: job.type,
    organizationId: job.organizationId,
    to: emailPayload.to,
    templateId: emailPayload.templateId,
    provider: result.provider,
    durationMs,
    requestId: job.requestId,
  });

  try {
    metrics.increment(METRIC_NAMES.EMAIL_SUCCESS, { organizationId: job.organizationId, provider: result.provider });
  } catch { /* metrics must never break business logic */ }

  return result;
}
