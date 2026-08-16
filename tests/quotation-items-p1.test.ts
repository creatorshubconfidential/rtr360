import { describe, it, expect } from 'vitest';

describe('P1-9: Quotation Items Normalization', () => {
  // ── Schema-level checks ──
  describe('QuotationItem model', () => {
    it('Quotation model no longer has items String column', () => {
      // Read schema and verify no 'items String' in Quotation model
      const fs = require('fs');
      const schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
      
      // Extract Quotation model block
      const match = schema.match(/model Quotation \{[\s\S]*?^\}/m);
      expect(match).not.toBeNull();
      const model = match![0];
      
      // Should NOT have 'items String'
      expect(model).not.toMatch(/items\s+String/);
      
      // Should have 'items QuotationItem[]' relation
      expect(model).toMatch(/items\s+QuotationItem\[\]/);
    });

    it('QuotationItem model exists with correct fields', () => {
      const fs = require('fs');
      const schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
      
      const match = schema.match(/model QuotationItem \{[\s\S]*?^\}/m);
      expect(match).not.toBeNull();
      const model = match![0];
      
      // Required fields
      expect(model).toMatch(/id\s+String/);
      expect(model).toMatch(/quotationId\s+String/);
      expect(model).toMatch(/sortOrder\s+Int/);
      expect(model).toMatch(/description\s+String/);
      expect(model).toMatch(/quantity\s+Int/);
      expect(model).toMatch(/unitPrice\s+Decimal/);
      
      // Relation
      expect(model).toMatch(/quotation\s+Quotation/);
      
      // Index
      expect(model).toMatch(/@@index\(\[quotationId\]\)/);
    });

    it('QuotationItem has onDelete Cascade', () => {
      const fs = require('fs');
      const schema = fs.readFileSync('prisma/schema.prisma', 'utf-8');
      
      const match = schema.match(/model QuotationItem \{[\s\S]*?^\}/m);
      expect(match).not.toBeNull();
      expect(match![0]).toMatch(/onDelete: Cascade/);
    });
  });

  // ── API-level checks ──
  describe('API routes use normalized items', () => {
    it('POST route creates items via nested create', () => {
      const fs = require('fs');
      const post = fs.readFileSync('src/app/api/quotations/route.ts', 'utf-8');
      
      // Should use transaction
      expect(post).toMatch(/\$transaction/);
      
      // Should use items with nested create
      expect(post).toMatch(/items:\s*\{/);
      expect(post).toMatch(/create:.*items\.map/);
      
      // Should include sortOrder
      expect(post).toMatch(/sortOrder/);
    });

    it('GET routes include items in response', () => {
      const fs = require('fs');
      const listRoute = fs.readFileSync('src/app/api/quotations/route.ts', 'utf-8');
      const detailRoute = fs.readFileSync('src/app/api/quotations/[id]/route.ts', 'utf-8');
      
      // Both should include items
      expect(listRoute).toMatch(/items:.*orderBy.*sortOrder/);
      expect(detailRoute).toMatch(/items:.*orderBy.*sortOrder/);
    });

    it('PATCH route supports items replacement', () => {
      const fs = require('fs');
      const patch = fs.readFileSync('src/app/api/quotations/[id]/route.ts', 'utf-8');
      
      // Should handle items array in body
      expect(patch).toMatch(/Array\.isArray\(items\)/);
      
      // Should delete old items and create new ones
      expect(patch).toMatch(/deleteMany/);
      expect(patch).toMatch(/create/);
    });

    it('POST validates item fields', () => {
      const fs = require('fs');
      const post = fs.readFileSync('src/app/api/quotations/route.ts', 'utf-8');
      
      // Should validate each item
      expect(post).toMatch(/item\.description/);
      expect(post).toMatch(/item\.quantity/);
      expect(post).toMatch(/item\.unitPrice/);
    });
  });

  // ── Frontend checks ──
  describe('Frontend uses normalized items', () => {
    it('Quotation type has items as QuotationItem[] not string', () => {
      const fs = require('fs');
      const types = fs.readFileSync('src/lib/types.ts', 'utf-8');
      
      // Find Quotation interface
      const match = types.match(/export interface Quotation \{[\s\S]*?^\}/m);
      expect(match).not.toBeNull();
      const iface = match![0];
      
      // items should be QuotationItem[], not string
      expect(iface).toMatch(/items:\s*QuotationItem\[\]/);
      // Should NOT be string
      expect(iface).not.toMatch(/items:\s*string/);
    });

    it('QuotationItem has id, quotationId, sortOrder fields', () => {
      const fs = require('fs');
      const types = fs.readFileSync('src/lib/types.ts', 'utf-8');
      
      const match = types.match(/export interface QuotationItem \{[\s\S]*?^\}/m);
      expect(match).not.toBeNull();
      const iface = match![0];
      
      expect(iface).toMatch(/id:\s*string/);
      expect(iface).toMatch(/quotationId:\s*string/);
      expect(iface).toMatch(/sortOrder:\s*number/);
    });

    it('QuotationItemInput type exists for form state', () => {
      const fs = require('fs');
      const types = fs.readFileSync('src/lib/types.ts', 'utf-8');
      
      expect(types).toMatch(/export interface QuotationItemInput/);
      expect(types).toMatch(/description:\s*string/);
      expect(types).toMatch(/quantity:\s*number/);
      expect(types).toMatch(/unitPrice:\s*number/);
    });

    it('No JSON.parse on items in QuotationsView', () => {
      const fs = require('fs');
      const view = fs.readFileSync('src/components/views/QuotationsView.tsx', 'utf-8');
      
      // Should NOT have parseItems function
      expect(view).not.toMatch(/parseItems/);
      // Should NOT have JSON.parse on items
      expect(view).not.toMatch(/JSON\.parse.*items/);
    });

    it('PipelineView uses QuotationItemInput', () => {
      const fs = require('fs');
      const view = fs.readFileSync('src/components/views/PipelineView.tsx', 'utf-8');
      
      expect(view).toMatch(/QuotationItemInput/);
    });
  });

  // ── Seed file checks ──
  describe('Seed file uses normalized items', () => {
    it('Seed creates items via nested create, not JSON.stringify', () => {
      const fs = require('fs');
      const seed = fs.readFileSync('src/lib/seed.ts', 'utf-8');
      
      // Extract only the quotation section (not the rest of the seed)
      const qStart = seed.indexOf('Creating quotations');
      const qEnd = seed.indexOf('Created 3 quotations', qStart);
      const quotationSection = seed.substring(qStart, qEnd + 30);
      
      // Should NOT have JSON.stringify for quotation items in this section
      expect(quotationSection).not.toMatch(/JSON\.stringify/);
      
      // Should use items.create
      expect(quotationSection).toMatch(/items:.*create/);
    });
  });
});
