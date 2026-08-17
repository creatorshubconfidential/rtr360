import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const API_DIR = path.resolve(__dirname, '../src/app/api');
const LIB_DIR = path.resolve(__dirname, '../src/lib');

function getRouteFiles(): string[] {
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'route.ts') files.push(full);
    }
  }
  walk(API_DIR);
  return files;
}

describe('P2-3: Audit Logging', () => {
  it('audit.ts helper exists with logAudit and getClientIp exports', () => {
    const auditPath = path.join(LIB_DIR, 'audit.ts');
    expect(fs.existsSync(auditPath)).toBe(true);
    const content = fs.readFileSync(auditPath, 'utf-8');
    expect(content).toContain('export async function logAudit');
    expect(content).toContain('export function getClientIp');
    expect(content).toContain('Fire-and-forget'); // Design intent documented
  });

  it('logAudit writes to AuditLog model with correct fields', () => {
    const content = fs.readFileSync(path.join(LIB_DIR, 'audit.ts'), 'utf-8');
    expect(content).toContain('db.auditLog.create');
    expect(content).toContain('userId');
    expect(content).toContain('action');
    expect(content).toContain('entity');
    expect(content).toContain('entityId');
    expect(content).toContain('organizationId');
    expect(content).toContain('ipAddress');
    expect(content).toContain('metadata');
  });

  it('logAudit never throws (error swallowed)', () => {
    const content = fs.readFileSync(path.join(LIB_DIR, 'audit.ts'), 'utf-8');
    // Should have try/catch that swallows errors
    expect(content).toContain('} catch');
    expect(content).toContain('Intentionally swallowed');
  });

  it('getClientIp extracts from X-Forwarded-For and X-Real-IP', () => {
    const content = fs.readFileSync(path.join(LIB_DIR, 'audit.ts'), 'utf-8');
    expect(content).toContain('x-forwarded-for');
    expect(content).toContain('x-real-ip');
  });

  it('all write routes import from @/lib/audit', () => {
    const routeFiles = getRouteFiles();
    const SKIP = ['auth/login', 'auth/logout', 'setup/seed']; // Auth handled separately; setup is bootstrap endpoint

    let missing: string[] = [];
    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const hasWrite = /export async function (POST|PUT|PATCH|DELETE)\(/.test(content);
      if (!hasWrite) continue;

      const isSkip = SKIP.some(s => file.includes(s));
      if (isSkip) continue;

      if (!content.includes("'@/lib/audit'")) {
        missing.push(path.relative(API_DIR, file));
      }
    }
    expect(missing).toEqual([]);
  });

  it('all collection POST routes call logAudit with create or update action', () => {
    const routeFiles = getRouteFiles();
    let missing: string[] = [];

    // notifications POST is actually an update (mark as read), not a create
    const EXCEPTIONS = ['notifications/route.ts', 'setup/seed/route.ts'];

    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (!/export async function POST\(/.test(content)) continue;
      if (file.includes('auth/')) continue;

      const rel = path.relative(API_DIR, file);
      if (EXCEPTIONS.some(e => rel.includes(e))) continue;

      if (!content.includes("action: 'create'")) {
        missing.push(rel);
      }
    }
    expect(missing).toEqual([]);
  });

  it('all [id] PATCH/DELETE routes call logAudit with correct action', () => {
    const routeFiles = getRouteFiles();
    let missing: string[] = [];

    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (!file.includes('[id]')) continue;

      if (/export async function (PATCH|PUT)\(/.test(content)) {
        if (!content.includes("action: 'update'")) {
          missing.push(path.relative(API_DIR, file) + ' (update)');
        }
      }
      if (/export async function DELETE\(/.test(content)) {
        if (!content.includes("action: 'delete'")) {
          missing.push(path.relative(API_DIR, file) + ' (delete)');
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('login route logs audit with action: login', () => {
    const loginPath = path.join(API_DIR, 'auth/login/route.ts');
    const content = fs.readFileSync(loginPath, 'utf-8');
    expect(content).toContain("action: 'login'");
    expect(content).toContain("entity: 'Session'");
    // Login uses local ip variable (from rate-limit.getClientIp), not direct getClientIp(request)
    expect(content).toContain('ipAddress: ip');
  });

  it('logout route logs audit with action: logout', () => {
    const logoutPath = path.join(API_DIR, 'auth/logout/route.ts');
    const content = fs.readFileSync(logoutPath, 'utf-8');
    expect(content).toContain("action: 'logout'");
    expect(content).toContain("entity: 'Session'");
  });

  it('audit calls pass ipAddress from getClientIp(request)', () => {
    const routeFiles = getRouteFiles();
    let missing: string[] = [];

    // Login uses local ip variable (from rate-limit.getClientIp), not direct call
    const SKIP_IP = ['auth/login/route.ts'];

    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (!content.includes('logAudit')) continue;

      const rel = path.relative(API_DIR, file);
      if (SKIP_IP.some(e => rel.includes(e))) continue;

      if (!content.includes('getClientIp(request)')) {
        missing.push(rel);
      }
    }
    expect(missing).toEqual([]);
  });
});
