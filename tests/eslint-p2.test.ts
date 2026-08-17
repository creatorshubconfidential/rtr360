import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

describe('P2-2: ESLint Rules Enabled', () => {
  it('react-hooks/exhaustive-deps is enabled as error', () => {
    const configPath = path.join(process.cwd(), 'eslint.config.mjs');
    const content = fs.readFileSync(configPath, 'utf8');
    expect(content).not.toContain('"react-hooks/exhaustive-deps": "off"');
    const hasOff = content.includes('"react-hooks/exhaustive-deps": "off"');
    expect(hasOff).toBe(false);
  });

  it('no-console is enabled as error', () => {
    const configPath = path.join(process.cwd(), 'eslint.config.mjs');
    const content = fs.readFileSync(configPath, 'utf8');
    expect(content).not.toContain('"no-console": "off"');
    const hasOff = content.includes('"no-console": "off"');
    expect(hasOff).toBe(false);
  });

  it('@typescript-eslint/no-explicit-any is enabled as error', () => {
    const configPath = path.join(process.cwd(), 'eslint.config.mjs');
    const content = fs.readFileSync(configPath, 'utf8');
    expect(content).not.toContain('"@typescript-eslint/no-explicit-any": "off"');
    const hasOff = content.includes('"@typescript-eslint/no-explicit-any": "off"');
    expect(hasOff).toBe(false);
  });

  it('seed.ts is in ESLint ignores', () => {
    const configPath = path.join(process.cwd(), 'eslint.config.mjs');
    const content = fs.readFileSync(configPath, 'utf8');
    expect(content).toContain('"src/lib/seed.ts"');
  });

  it('logger utility exists', () => {
    const loggerPath = path.join(process.cwd(), 'src/lib/logger.ts');
    const content = fs.readFileSync(loggerPath, 'utf8');
    expect(content).toContain('export const logger');
    expect(content).toContain('debug');
    expect(content).toContain('info');
    expect(content).toContain('warn');
    expect(content).toContain('error');
  });
});
