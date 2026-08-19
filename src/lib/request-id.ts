/**
 * Request ID generation and propagation for RTR 360.
 *
 * Every incoming request receives a correlation ID.
 * If a trusted incoming x-request-id header exists, it is validated and reused.
 * Otherwise, a cryptographically strong ID is generated.
 *
 * Format: rtr_<32 hex chars> = 36 chars total
 */

const REQUEST_ID_PREFIX = 'rtr_';
const REQUEST_ID_HEX_LENGTH = 32;
const REQUEST_ID_PATTERN = new RegExp(
  `^${REQUEST_ID_PREFIX}[a-f0-9]{${REQUEST_ID_HEX_LENGTH}}$`
);
const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Generate a new cryptographically strong request ID.
 * Uses crypto.randomUUID() which provides 128 bits of entropy.
 */
export function generateRequestId(): string {
  const uuid = crypto.randomUUID().replace(/-/g, '');
  return `${REQUEST_ID_PREFIX}${uuid.slice(0, REQUEST_ID_HEX_LENGTH)}`;
}

/**
 * Validate an incoming x-request-id header value.
 * Returns the value if it matches the expected format, or null if invalid.
 */
export function validateRequestId(value: string): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 128) return null;
  if (!REQUEST_ID_PATTERN.test(trimmed)) return null;
  return trimmed;
}

/**
 * Get or generate a request ID for an incoming request.
 * If the request has a valid x-request-id header, reuse it.
 * Otherwise, generate a new one.
 */
export function getRequestId(request: Request): string {
  const incoming = request.headers.get(REQUEST_ID_HEADER);
  if (incoming) {
    const valid = validateRequestId(incoming);
    if (valid) return valid;
  }
  return generateRequestId();
}

export { REQUEST_ID_HEADER };
