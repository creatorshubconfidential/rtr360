/**
 * RTR 360 — Email Provider Exports
 *
 * Central export point for email provider infrastructure.
 * Re-exports from handlers for convenience.
 */

export { SmtpEmailProvider } from '@/lib/email/smtp-provider';
export type { EmailProvider, EmailSendResult } from '@/lib/handlers/email-handler';
export {
  registerEmailProvider,
  getEmailProvider,
} from '@/lib/handlers/email-handler';
