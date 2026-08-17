/**
 * P0-3: Money Fields — Float → Decimal Precision Tests
 * 
 * Verifies:
 * 1. All 12 money fields in schema use Decimal type (not Float)
 * 2. Decimal.prototype.toJSON patch exists for JSON serialization
 * 3. No Float remains in money-context model fields
 * 4. API routes properly handle Decimal arithmetic with Number() conversion
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
const schema = fs.readFileSync(schemaPath, 'utf-8');
const dbPath = path.join(__dirname, '../src/lib/db.ts');
const dbCode = fs.readFileSync(dbPath, 'utf-8');

// All 12 money fields that MUST be Decimal
const MONEY_FIELDS = [
  { model: 'Device', field: 'purchaseCost', column: 'purchase_cost', nullable: true },
  { model: 'MaintenanceRecord', field: 'cost', column: 'cost', nullable: true },
  { model: 'Plan', field: 'priceMonthly', column: 'price_monthly', nullable: false },
  { model: 'Plan', field: 'priceAnnual', column: 'price_annual', nullable: true },
  { model: 'Invoice', field: 'amount', column: 'amount', nullable: false },
  { model: 'Invoice', field: 'tax', column: 'tax', nullable: false },
  { model: 'Invoice', field: 'total', column: 'total', nullable: false },
  { model: 'Quotation', field: 'subtotal', column: 'subtotal', nullable: false },
  { model: 'Quotation', field: 'taxRate', column: 'tax_rate', nullable: false },
  { model: 'Quotation', field: 'tax', column: 'tax', nullable: false },
  { model: 'Quotation', field: 'total', column: 'total', nullable: false },
  { model: 'QuotationItem', field: 'unitPrice', column: 'unit_price', nullable: false },
];

// Non-money Float fields that should REMAIN as Float
const NON_MONEY_FLOAT_FIELDS = [
  { model: 'Vehicle', field: 'mileage' },
  { model: 'Vehicle', field: 'engineHours' },
  { model: 'Vehicle', field: 'score' },
  { model: 'Vehicle', field: 'totalDistance' },
  { model: 'Driver', field: 'rating' },
  { model: 'Device', field: 'latitude' },
  { model: 'Device', field: 'longitude' },
  { model: 'Trip', field: 'distance' },
  { model: 'Trip', field: 'maxSpeed' },
  { model: 'Trip', field: 'avgSpeed' },
  { model: 'Geofence', field: 'centerLat' },
  { model: 'Geofence', field: 'centerLng' },
  { model: 'Geofence', field: 'radius' },
  { model: 'AlertRule', field: 'triggerValue' },
];
// Note: Setting.value is String type (generic key-value store), not Float

describe('P0-3: Money Fields Float → Decimal', () => {
  describe('Schema: All 12 money fields use Decimal', () => {
    for (const { model, field, nullable } of MONEY_FIELDS) {
      it(`${model}.${field} should be Decimal type`, () => {
        // Find the model block
        const modelRegex = new RegExp(`model ${model}\\s*\\{`);
        const modelMatch = schema.match(modelRegex);
        expect(modelMatch, `Model ${model} not found in schema`).toBeTruthy();

        // Get the model block content
        const modelStart = schema.indexOf(modelMatch![0]);
        const nextModel = schema.indexOf('\nmodel ', modelStart + 1);
        const modelBlock = schema.slice(modelStart, nextModel === -1 ? schema.length : nextModel);

        // Find the field definition
        const fieldRegex = new RegExp(`${field}\\s+(\\w+)`);
        const fieldMatch = modelBlock.match(fieldRegex);
        expect(fieldMatch, `Field ${field} not found in model ${model}`).toBeTruthy();

        const type = fieldMatch![1];
        expect(type).toBe('Decimal');
      });
    }
  });

  describe('Schema: Non-money Float fields remain Float', () => {
    for (const { model, field } of NON_MONEY_FLOAT_FIELDS) {
      it(`${model}.${field} should remain Float`, () => {
        const modelRegex = new RegExp(`model ${model}\\s*\\{`);
        const modelMatch = schema.match(modelRegex);
        if (!modelMatch) return; // skip if model not found

        const modelStart = schema.indexOf(modelMatch[0]);
        const nextModel = schema.indexOf('\nmodel ', modelStart + 1);
        const modelBlock = schema.slice(modelStart, nextModel === -1 ? schema.length : nextModel);

        const fieldRegex = new RegExp(`${field}\\s+(\\w+)`);
        const fieldMatch = modelBlock.match(fieldRegex);
        if (!fieldMatch) return; // skip if field not found

        const type = fieldMatch[1];
        expect(type).toBe('Float');
      });
    }
  });

  describe('Schema: Zero Float in money models', () => {
    it('Invoice model should have zero Float fields', () => {
      const modelRegex = /model Invoice\s*\{/;
      const match = schema.match(modelRegex);
      expect(match).toBeTruthy();
      const start = schema.indexOf(match![0]);
      const end = schema.indexOf('\nmodel ', start + 1);
      const block = schema.slice(start, end === -1 ? schema.length : end);
      const floatMatches = block.match(/\bFloat\b/g);
      expect(floatMatches).toBeNull();
    });

    it('Quotation model should have zero Float fields', () => {
      const modelRegex = /model Quotation\s*\{/;
      const match = schema.match(modelRegex);
      expect(match).toBeTruthy();
      const start = schema.indexOf(match![0]);
      const end = schema.indexOf('\nmodel ', start + 1);
      const block = schema.slice(start, end === -1 ? schema.length : end);
      const floatMatches = block.match(/\bFloat\b/g);
      expect(floatMatches).toBeNull();
    });

    it('QuotationItem model should have zero Float fields', () => {
      const modelRegex = /model QuotationItem\s*\{/;
      const match = schema.match(modelRegex);
      expect(match).toBeTruthy();
      const start = schema.indexOf(match![0]);
      const end = schema.indexOf('\nmodel ', start + 1);
      const block = schema.slice(start, end === -1 ? schema.length : end);
      const floatMatches = block.match(/\bFloat\b/g);
      expect(floatMatches).toBeNull();
    });

    it('Plan model should have zero Float fields (prices are money)', () => {
      const modelRegex = /model Plan\s*\{/;
      const match = schema.match(modelRegex);
      expect(match).toBeTruthy();
      const start = schema.indexOf(match![0]);
      const end = schema.indexOf('\nmodel ', start + 1);
      const block = schema.slice(start, end === -1 ? schema.length : end);
      const floatMatches = block.match(/\bFloat\b/g);
      expect(floatMatches).toBeNull();
    });
  });

  describe('Decimal.prototype.toJSON patch', () => {
    it('db.ts should contain Decimal.prototype.toJSON patch', () => {
      expect(dbCode).toContain('Prisma.Decimal.prototype');
      expect(dbCode).toContain('.toJSON');
      expect(dbCode).toContain('Number(this)');
    });

    it('Decimal serialization produces number (not string)', () => {
      const { Prisma } = require('@prisma/client');
      // Replicate the same patch from db.ts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Prisma.Decimal.prototype as any).toJSON = function () { return Number(this); };

      const d = new Prisma.Decimal('1250.50');
      const jsonVal = d.toJSON();
      expect(typeof jsonVal).toBe('number');
      expect(jsonVal).toBe(1250.50);
    });

    it('Decimal precision is preserved (no Float rounding errors)', () => {
      const { Prisma } = require('@prisma/client');
      // Classic Float precision issue: 0.1 + 0.2 !== 0.3
      const a = new Prisma.Decimal('0.1');
      const b = new Prisma.Decimal('0.2');
      const sum = a.plus(b);
      expect(sum.toString()).toBe('0.3');
      expect(Number(sum)).toBeCloseTo(0.3, 10);
    });
  });

  describe('API routes use Number() for Decimal arithmetic', () => {
    const apiDir = path.join(__dirname, '../src/app/api');

    const routesWithDecimalArithmetic = [
      'reports/route.ts',
      'analytics/revenue-forecast/route.ts',
      'analytics/maintenance-prediction/route.ts',
      'invoices/[id]/pdf/route.ts',
      'quotations/[id]/route.ts',
    ];

    it('reports/route.ts should use Number() for invoice.total in reduce', () => {
      const code = fs.readFileSync(path.join(apiDir, 'reports/route.ts'), 'utf-8');
      // Should have Number() wrapping for Decimal fields in reduce
      const reduceWithNumber = (code.match(/Number\(i\.total\)/g) || []).length;
      expect(reduceWithNumber).toBeGreaterThanOrEqual(2); // At least 2 occurrences
    });

    it('revenue-forecast should use Number() for Decimal fields', () => {
      const code = fs.readFileSync(path.join(apiDir, 'analytics/revenue-forecast/route.ts'), 'utf-8');
      expect(code).toContain('Number(inv.total)');
      expect(code).toContain('Number(s.plan.priceMonthly)');
      expect(code).toContain('Number(b._sum.total');
    });

    it('maintenance-prediction should use Number() for cost', () => {
      const code = fs.readFileSync(path.join(apiDir, 'analytics/maintenance-prediction/route.ts'), 'utf-8');
      const matches = (code.match(/Number\(r\.cost/g) || []).length;
      expect(matches).toBeGreaterThanOrEqual(2);
    });

    it('invoice PDF should use Number() for Decimal fields', () => {
      const code = fs.readFileSync(path.join(apiDir, 'invoices/[id]/pdf/route.ts'), 'utf-8');
      expect(code).toContain('Number(invoice.amount)');
      expect(code).toContain('Number(invoice.tax)');
      expect(code).toContain('Number(invoice.total)');
    });

    it('quotations PATCH should use Number() for taxRate', () => {
      const code = fs.readFileSync(path.join(apiDir, 'quotations/[id]/route.ts'), 'utf-8');
      expect(code).toContain('Number(quotation.taxRate');
    });
  });
});
