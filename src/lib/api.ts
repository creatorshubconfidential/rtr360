// ────────────────────────────────────────
// RTR 360 — Auth Fetch Helper
// Powered by Mianx.ai
// ────────────────────────────────────────

/**
 * Authenticated fetch helper.
 * - Auth is handled via HttpOnly cookie (rtr_session) — browser sends it automatically.
 * - Intercepts 401 responses and redirects to login.
 * - Sets Content-Type to JSON by default.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  // 401 interceptor: redirect to login when session expires
  if (response.status === 401 && typeof window !== 'undefined') {
    // Avoid redirect loop on login page itself
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/?tab=login';
    }
  }

  return response;
}

export function formatAED(amount: number): string {
  return `AED ${amount.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-AE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
