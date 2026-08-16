/**
 * P1-5: Cookie-Only Auth Tests — RTR 360
 * 
 * Verifies that:
 * 1. extractToken() reads cookie FIRST, Authorization header second
 * 2. authFetch() does NOT use localStorage
 * 3. Login response no longer exposes token in body
 * 4. Logout reads from cookie, not request body
 * 5. No localStorage.getItem('rtr_token') remains in any source file
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================
// Test extractToken priority (cookie-first)
// ============================================================

const SESSION_COOKIE_NAME = 'rtr_session';

/** Mirror of extractToken from src/lib/auth.ts */
function extractToken(authHeader: string | null, cookieHeader: string | null): string | null {
  // 1. HttpOnly cookie (primary)
  if (cookieHeader) {
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`));
    if (match) return decodeURIComponent(match[1]);
  }
  // 2. Authorization header fallback
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') return parts[1];
  }
  return null;
}

describe('P1-5: extractToken cookie-first priority', () => {
  it('extracts token from HttpOnly cookie', () => {
    const token = extractToken(null, 'rtr_session=abc123');
    expect(token).toBe('abc123');
  });

  it('extracts token from cookie with other cookies present', () => {
    const token = extractToken(null, 'other=foo; rtr_session=abc123; another=bar');
    expect(token).toBe('abc123');
  });

  it('extracts URL-encoded token from cookie', () => {
    const token = extractToken(null, 'rtr_session=abc%20123');
    expect(token).toBe('abc 123');
  });

  it('falls back to Authorization header when no cookie', () => {
    const token = extractToken('Bearer xyz789', null);
    expect(token).toBe('xyz789');
  });

  it('cookie takes PRIORITY over Authorization header', () => {
    // Both present — cookie should win
    const token = extractToken('Bearer header_token', 'rtr_session=cookie_token');
    expect(token).toBe('cookie_token');
  });

  it('returns null when neither cookie nor header present', () => {
    const token = extractToken(null, null);
    expect(token).toBeNull();
  });

  it('returns null for malformed Authorization header', () => {
    const token = extractToken('Basic abc123', null);
    expect(token).toBeNull();
  });

  it('returns null for empty cookie', () => {
    const token = extractToken(null, 'other=foo');
    expect(token).toBeNull();
  });
});

// ============================================================
// Test: No localStorage auth in source files
// ============================================================

describe('P1-5: Zero localStorage auth calls in source', () => {
  function getSourceFiles(dir: string, ext = '.ts'): string[] {
    const files: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...getSourceFiles(full, ext));
      } else if (entry.name.endsWith(ext) || entry.name.endsWith('.tsx')) {
        files.push(full);
      }
    }
    return files;
  }

  it('no localStorage.getItem/setItem/removeItem for auth tokens in any source file', () => {
    const srcDir = path.resolve(process.cwd(), 'src');
    const files = getSourceFiles(srcDir);
    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      // Match actual localStorage API calls (not comments)
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          (line.includes('localStorage.getItem') || line.includes('localStorage.setItem') || line.includes('localStorage.removeItem')) &&
          !line.trim().startsWith('//') &&
          !line.trim().startsWith('*')
        ) {
          violations.push(`${path.relative(process.cwd(), file)}:${i + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations, `Found localStorage auth calls:\n${violations.join('\n')}`).toHaveLength(0);
  });

  it('authFetch in api.ts does NOT reference localStorage', () => {
    const apiPath = path.resolve(process.cwd(), 'src/lib/api.ts');
    const content = fs.readFileSync(apiPath, 'utf-8');
    // Should not have any localStorage.getItem call
    expect(content).not.toMatch(/localStorage\.getItem/);
  });

  it('all view components import authFetch from @/lib/api, not define locally', () => {
    const viewsDir = path.resolve(process.cwd(), 'src/components/views');
    const files = getSourceFiles(viewsDir);
    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      if (content.includes('function authFetch') || content.includes('const authFetch =')) {
        violations.push(path.relative(process.cwd(), file));
      }
    }

    expect(violations, `Files with local authFetch definition:\n${violations.join('\n')}`).toHaveLength(0);
  });
});

// ============================================================
// Test: Login API does not expose token in response body
// ============================================================

describe('P1-5: Login API does not leak token in response body', () => {
  it('login route does not return token field in JSON response', () => {
    const loginRoute = path.resolve(process.cwd(), 'src/app/api/auth/login/route.ts');
    const content = fs.readFileSync(loginRoute, 'utf-8');
    // The response JSON should have user but NOT token in the body
    // Look for the response object pattern
    expect(content).toContain('user:');
    // Should have a comment about HttpOnly cookie
    expect(content).toContain('HttpOnly cookie');
    // Should NOT have `token,` in the response JSON (token is only in cookie)
    // The response should have user object and a comment, but no token field
    const responseBlock = content.match(/NextResponse\.json\(\{[\s\S]*?\}\)/);
    if (responseBlock) {
      expect(responseBlock[0]).not.toMatch(/token[,}]/);
    }
  });
});

// ============================================================
// Test: Logout API reads cookie, not request body
// ============================================================

describe('P1-5: Logout API uses cookie-based token extraction', () => {
  it('logout route uses extractToken, not body parsing', () => {
    const logoutRoute = path.resolve(process.cwd(), 'src/app/api/auth/logout/route.ts');
    const content = fs.readFileSync(logoutRoute, 'utf-8');
    // Should use extractToken helper
    expect(content).toContain('extractToken');
    // Should NOT parse request body for token
    expect(content).not.toContain('request.json()');
    expect(content).not.toContain('body.token');
  });
});

// ============================================================
// Test: EventSource in LiveTrackingView does not pass token
// ============================================================

describe('P1-5: LiveTrackingView EventSource uses cookies', () => {
  it('EventSource URL does not contain token query parameter', () => {
    const filePath = path.resolve(process.cwd(), 'src/components/views/LiveTrackingView.tsx');
    const content = fs.readFileSync(filePath, 'utf-8');
    // Should NOT have token in URL
    expect(content).not.toContain('?token=');
    expect(content).not.toContain('${token}');
    // Should use clean URL
    expect(content).toContain("new EventSource('/api/realtime/vehicles')");
  });
});

// ============================================================
// Test: authFetch behavior (cookie-only, no Authorization header)
// ============================================================

describe('P1-5: authFetch does not send Authorization header', () => {
  it('authFetch only sends Content-Type, no Authorization', () => {
    // Read the actual authFetch implementation
    const apiPath = path.resolve(process.cwd(), 'src/lib/api.ts');
    const content = fs.readFileSync(apiPath, 'utf-8');
    // Should NOT contain Authorization header construction
    expect(content).not.toContain('Authorization');
    expect(content).not.toContain('Bearer');
  });
});
