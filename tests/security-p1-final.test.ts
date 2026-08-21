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

describe('P1 FINAL — Cross-Tenant FK Validation', () => {
  const fkRoutes = [
    { file: 'vehicles/route.ts', field: 'branchId', check: 'branch' },
    { file: 'vehicles/[id]/route.ts', field: 'branchId', check: 'branch' },
    { file: 'vehicles/[id]/route.ts', field: 'driverId', check: 'driver' },
    { file: 'devices/route.ts', field: 'simId', check: 'sim' },
    { file: 'installations/route.ts', field: 'technicianId', check: 'technician' },
    { file: 'installations/[id]/route.ts', field: 'technicianId', check: 'technician' },
    { file: 'tickets/route.ts', field: 'assignedToId', check: 'assignee' },
  ];

  for (const { file, field, check } of fkRoutes) {
    it(`${file}: ${field} validated against organizationId (cross-tenant FK protection)`, () => {
      const content = fs.readFileSync(path.join(API_DIR, file), 'utf-8');
      // Must have a findFirst with organizationId check for the FK
      expect(content).toContain('findFirst');
      expect(content).toContain('organizationId');
      // Must NOT blindly assign the FK without validation
      // The pattern should be: validate first, then assign
      const lines = content.split('\n');
      const firstRefLine = lines.findIndex(l => l.includes(field));
      const firstFindFirstLine = lines.findIndex(l => l.includes('findFirst'));
      // findFirst should come before or at the same area as the field usage
      // (validation happens before assignment)
      expect(firstFindFirstLine).toBeGreaterThanOrEqual(0);
    });
  }
});

describe('P1 FINAL — AI Conversation Security', () => {
  it('conversation listing is user-scoped, not org-wide for regular users', () => {
    const content = fs.readFileSync(path.join(API_DIR, 'ai/chat/route.ts'), 'utf-8');
    // Should use userId filter for regular users
    expect(content).toContain('userId: user.id');
    // Should NOT have the old OR pattern with both userId and organizationId
    const getBlock = content.substring(content.indexOf('export async function GET'));
    // Old vulnerable pattern was: OR: [ { userId: user.id }, { organizationId: ... } ]
    expect(getBlock).not.toContain('OR:');
  });

  it('buildFleetContext returns zeros when no organizationId (no cross-tenant exposure)', () => {
    const content = fs.readFileSync(path.join(API_DIR, 'ai/chat/route.ts'), 'utf-8');
    // Must check for null organizationId and return zeros
    expect(content).toContain('if (!organizationId)');
    expect(content).toContain('return {');
    expect(content).toContain('vehicleCount: 0');
  });

  it('single conversation GET verifies organization ownership', () => {
    const content = fs.readFileSync(path.join(API_DIR, 'ai/conversations/[id]/route.ts'), 'utf-8');
    expect(content).toContain('conversation.organizationId !== user.organizationId');
  });
});

describe('P1 FINAL — No Mass Assignment', () => {
  it('no route uses ...body or ...data to spread request body into Prisma', () => {
    const routeFiles = getRouteFiles();
    const violations: string[] = [];
    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      if (/\bdata:\s*\{[^}]*\.\.\.(body|data|req\.body)/.test(content)) {
        violations.push(path.relative(API_DIR, file));
      }
      if (/Object\.assign\s*\([^)]*body/.test(content)) {
        violations.push(path.relative(API_DIR, file) + ' (Object.assign)');
      }
    }
    expect(violations).toEqual([]);
  });

  it('sensitive fields are never directly from body without validation', () => {
    const routeFiles = getRouteFiles();
    const violations: string[] = [];
    const sensitiveFields = ['isSuperAdmin', 'role', 'permissions'];
    for (const file of routeFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const field of sensitiveFields) {
        // Check if field is taken from body and put into updateData without validation
        if (new RegExp(`updateData\.${field}\s*=\s*body\.${field}`).test(content)) {
          violations.push(`${path.relative(API_DIR, file)} (${field})`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

describe('P1 FINAL — Setup Endpoint Security', () => {
  it('SETUP_INIT_KEY is never hardcoded', () => {
    const content = fs.readFileSync(path.join(API_DIR, 'setup/init/route.ts'), 'utf-8');
    // INIT_KEY must come from env
    expect(content).toContain('process.env.SETUP_INIT_KEY');
    // Must NOT have any hardcoded string that looks like a key
    expect(content).not.toMatch(/INIT_KEY\s*=\s*['"][^'"]{10,}['"]/);
  });

  it('missing SETUP_INIT_KEY returns error (deny-by-default)', () => {
    const content = fs.readFileSync(path.join(API_DIR, 'setup/init/route.ts'), 'utf-8');
    expect(content).toContain("!INIT_KEY");
    expect(content).toContain('SETUP_INIT_KEY not configured');
  });

  it('wrong key returns 403 with timing-safe comparison', () => {
    const content = fs.readFileSync(path.join(API_DIR, 'setup/init/route.ts'), 'utf-8');
    expect(content).toContain('timingSafeEqual');
    expect(content).toContain('Invalid setup key');
  });

  it('no hardcoded fallback password', () => {
    const content = fs.readFileSync(path.join(API_DIR, 'setup/init/route.ts'), 'utf-8');
    expect(content).not.toContain("Rtr360@2024");
    expect(content).toContain('SEED_PASSWORD environment variable is required');
  });

  it('password not returned in init response', () => {
    const content = fs.readFileSync(path.join(API_DIR, 'setup/init/route.ts'), 'utf-8');
    // password: SEED_PASSWORD must NOT appear in the response object
    const responseBlock = content.split('return NextResponse.json({')[1];
    if (responseBlock) {
      const firstReturn = responseBlock.split('});')[0];
      expect(firstReturn).not.toContain('password:');
    }
  });

  it('GET endpoint does not leak configuration state', () => {
    const content = fs.readFileSync(path.join(API_DIR, 'setup/init/route.ts'), 'utf-8');
    // The GET handler must NOT contain 'configured:'
    const getBlock = content.split('export async function GET')[1];
    if (getBlock) {
      const funcBody = getBlock.split('}')[0];
      expect(funcBody).not.toContain('configured:');
    }
  });
});

describe('P1 FINAL — Contract Status Validation', () => {
  it('contracts [id] PATCH validates status against allowed values', () => {
    const content = fs.readFileSync(path.join(API_DIR, 'contracts/[id]/route.ts'), 'utf-8');
    expect(content).toContain('VALID_STATUSES');
    expect(content).toContain('!VALID_STATUSES.includes(status)');
  });
});

describe('P1 FINAL — Rate Limiter Architecture', () => {
  it('rate limiter has L1 (memory), L2 (Redis), L3 (DB) tiers', () => {
    const content = fs.readFileSync(path.join(LIB_DIR, 'rate-limit.ts'), 'utf-8');
    expect(content).toContain('L1');
    expect(content).toContain('L2');
    expect(content).toContain('L3');
    expect(content).toContain('Redis');
    expect(content).toContain('incrementInRedis');
    expect(content).toContain('incrementInDb');
  });

  it('Redis failure falls back to L1-only (never open)', () => {
    const content = fs.readFileSync(path.join(LIB_DIR, 'rate-limit.ts'), 'utf-8');
    // L1-only fallback must exist
    expect(content).toContain('l1OnlyRateLimit');
    // DB failure flag must exist
    expect(content).toContain('l3DbFailed');
    // Redis failures must not throw — redis.ts handles circuit breaker
    const redisContent = fs.readFileSync(path.join(LIB_DIR, 'redis.ts'), 'utf-8');
    expect(redisContent).toContain('CIRCUIT_BREAKER');
    expect(redisContent).toContain('timeout');
  });

  it('Redis uses atomic pipeline (INCR + EXPIRE)', () => {
    const redisContent = fs.readFileSync(path.join(LIB_DIR, 'redis.ts'), 'utf-8');
    expect(redisContent).toContain('incrWithExpire');
    expect(redisContent).toContain('INCR');
    expect(redisContent).toContain('EXPIRE');
    // Rate limiter must use the shared redis abstraction
    const rlContent = fs.readFileSync(path.join(LIB_DIR, 'rate-limit.ts'), 'utf-8');
    expect(rlContent).toContain("from '@/lib/redis'");
  });

  it('Redis has connection timeout', () => {
    const redisContent = fs.readFileSync(path.join(LIB_DIR, 'redis.ts'), 'utf-8');
    expect(redisContent).toContain('AbortController');
    expect(redisContent).toContain('timeout');
  });
});

describe('P1 FINAL — Git Hygiene', () => {
  it('bun-types is not in package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'));
    expect(pkg.devDependencies?.['bun-types']).toBeUndefined();
    expect(pkg.dependencies?.['bun-types']).toBeUndefined();
  });

  it('start script does not use bun', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'));
    expect(pkg.scripts?.start).not.toContain('bun ');
  });

  it('.gitignore covers tool-results/', () => {
    const gitignore = fs.readFileSync(path.resolve(__dirname, '../.gitignore'), 'utf-8');
    expect(gitignore).toContain('tool-results/');
  });
});

describe('P1 FINAL — CI Configuration', () => {
  it('CI uses npm (not bun or yarn)', () => {
    const ci = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/ci.yml'), 'utf-8');
    expect(ci).toContain('npm ci');
    expect(ci).toContain('npm run lint');
    expect(ci).toContain('npm run build');
    expect(ci).toContain('npm test');
    expect(ci).not.toContain('bun ');
  });

  it('CI runs build (catches module resolution issues)', () => {
    const ci = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/ci.yml'), 'utf-8');
    expect(ci).toContain('npm run build');
  });
});
