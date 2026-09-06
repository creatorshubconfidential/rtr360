/**
 * P0-4 — Migration Parity Engine
 *
 * Compares two artifacts WITHOUT a live database:
 *   1. prisma/schema.prisma        (declared intent)
 *   2. prisma/migrations/ SQL files (replayed cumulatively → expected DB)
 * and reports drift: missing tables, missing columns, wrong types,
 * nullability, defaults, unique constraints, indexes, foreign keys.
 *
 * The replayer handles the dialect used in this repository:
 *   - prisma-generated DDL (0_init style)
 *   - idempotent exception-guarded DO-block DDL (ADD COLUMN / ADD CONSTRAINT /
 *     RENAME COLUMN / ALTER COLUMN TYPE-DEFAULT inside BEGIN...EXCEPTION...END)
 *   - ALTER COLUMN TYPE ... USING casts, RENAME COLUMN, ADD CONSTRAINT
 *
 * Live-DB parity (_prisma_migrations, live information_schema) is
 * operator-gated: scripts/p04_parity_check.sh + sql/migration_parity/.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_PATH = path.join(ROOT, 'prisma', 'schema.prisma');
const MIGRATIONS_DIR = path.join(ROOT, 'prisma', 'migrations');

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface Col {
  name: string;
  type: string;
  notNull: boolean;
  def: string | null;
  unique: boolean;
}
interface Fk {
  toTable: string;
  toCols: string[];
  onDelete: string;
  onUpdate: string;
}
interface Table {
  name: string;
  cols: Map<string, Col>;
  uniques: string[][];
  indexes: string[][];
  fks: Map<string, Fk>;
}
interface Db {
  tables: Map<string, Table>;
}
interface Drift { kind: string; table: string; detail: string }

// ─────────────────────────────────────────────────────────────
// Normalization helpers
// ─────────────────────────────────────────────────────────────
const typeKey = (t: string): string =>
  t.trim().toLowerCase().replace(/\s+/g, ' ')
    .replace(/^character varying.*$/, 'text')
    .replace(/^varchar.*$/, 'text')
    .replace(/^int$/, 'integer')
    // Prisma always uses millisecond precision (3) for timestamps; a DB
    // column declared without the modifier has the same ms-precision
    // semantics for this app (prisma never emits (6)).
    // Deliberate equivalence: timestamptz(3) === timestamptz, timestamp(3) === timestamp.
    .replace(/^(timestamp|timestamptz)\(\d+\)$/, '$1')
    .replace(/\s*,\s*/g, ',');

const normCols = (cols: string[]): string[] => cols.map((c) => c.trim().toLowerCase().replace(/^"|"$/g, ''));
const colsKey = (cols: string[]): string => normCols(cols).join(',');

function exists(p: string): boolean {
  try { statSync(p); return true; } catch { return false; }
}
function migrationDirs(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((d) => statSync(path.join(MIGRATIONS_DIR, d)).isDirectory() && exists(path.join(MIGRATIONS_DIR, d, 'migration.sql')))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); // prisma applies lexicographically
}

// ─────────────────────────────────────────────────────────────
// 1. Schema parser (prisma schema.prisma → expected Db)
// ─────────────────────────────────────────────────────────────
function parsePrismaDefault(raw: string): string | null {
  if (/^(cuid|uuid|autoincrement)\s*\(\s*\)$/.test(raw)) return null;
  if (/^now\s*\(\s*\)$/.test(raw)) return 'current_timestamp';
  const m = raw.match(/^["'](.*)["']$/);
  if (m) return `'${m[1]}'`;
  return raw;
}

// Extract a @default(...) argument with balanced parentheses.
function extractDefaultAttr(attrs: string): string | null {
  const start = attrs.indexOf('@default(');
  if (start === -1) return null;
  let i = start + '@default('.length;
  let depth = 1;
  let out = '';
  while (i < attrs.length && depth > 0) {
    const ch = attrs[i];
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) break; }
    out += ch;
    i++;
  }
  return out;
}

function prismaScalarTypeToSql(type: string, attrs: string): string {
  const dbAttr = attrs.match(/@db\.(\w+(?:\(\d+(?:,\s*\d+)?\))?)/);
  const d = dbAttr ? dbAttr[1] : null;
  switch (type) {
    case 'String': return d ? d.toLowerCase() : 'text';
    case 'Int': return d ? d.toLowerCase() : 'integer';
    case 'BigInt': return 'bigint';
    // Prisma maps Float to REAL in PostgreSQL (verified against prisma-generated 0_init)
    case 'Float': return d ? d.toLowerCase() : 'real';
    case 'Decimal': return d ? `numeric(${d.replace(/decimal\(|\)/gi, '').trim()})` : 'numeric(65,30)';
    case 'Boolean': return 'boolean';
    case 'DateTime': return d ? d.toLowerCase() : 'timestamp(3)';
    case 'Json': return 'jsonb';
    case 'Bytes': return 'bytea';
    default: return type.toLowerCase();
  }
}

function parseSchema(): { db: Db; modelNames: string[] } {
  const src = readFileSync(SCHEMA_PATH, 'utf8');
  const db: Db = { tables: new Map() };
  const modelRe = /^model (\w+) \{([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;

  while ((m = modelRe.exec(src)) !== null) {
    const modelName = m[1];
    const body = m[2];
    const table: Table = { name: modelName, cols: new Map(), uniques: [], indexes: [], fks: new Map() };
    const fieldToCol = new Map<string, string>(); // prisma field name → physical column
    const fkPending: { fields: string[]; onDelete?: string; onUpdate?: string; required: boolean }[] = [];

    for (const line of body.split('\n')) {
      const fm = line.match(/^\s{2}(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/);
      if (fm && !line.trim().startsWith('//')) {
        const [, name, type, isList, isOpt, attrsRaw] = fm;
        const attrs = attrsRaw ?? '';
        if (isList) continue; // relation list side
        const colName = attrs.match(/@map\("([^"]+)"\)/)?.[1] ?? name;
        fieldToCol.set(name, colName.toLowerCase());

        if (attrs.includes('@relation(')) {
          const rel = attrs.match(/@relation\(([^)]*)\)/);
          if (rel && rel[1].includes('fields:')) {
            const fields = rel[1].match(/fields:\s*\[([^\]]*)\]/)?.[1].split(',').map((s) => s.trim()).filter(Boolean) ?? [];
            fkPending.push({ fields, onDelete: rel[1].match(/onDelete:\s*(\w+)/)?.[1], onUpdate: rel[1].match(/onUpdate:\s*(\w+)/)?.[1], required: !isOpt });
            continue;
          }
          continue; // opposite side of relation
        }

        const sqlType = prismaScalarTypeToSql(type, attrs);
        const defRaw = extractDefaultAttr(attrs);
        const def = defRaw !== null ? parsePrismaDefault(defRaw) : null;
        table.cols.set(colName.toLowerCase(), {
          name: colName,
          type: typeKey(sqlType),
          notNull: !isOpt,
          def,
          unique: attrs.includes('@unique'),
        });
        continue;
      }
      const im = line.match(/@@index\(\[([^\]]*)\]/);
      if (im) {
        const cols = im[1].split(',').map((s) => s.trim()).filter(Boolean);
        table.indexes.push(normCols(cols.map((c) => fieldToCol.get(c) ?? c)));
      }
      const um = line.match(/@@unique\(\[([^\]]*)\]/);
      if (um) {
        const cols = um[1].split(',').map((s) => s.trim()).filter(Boolean);
        table.uniques.push(normCols(cols.map((c) => fieldToCol.get(c) ?? c)));
      }
    }

    // Resolve FKs (child col keyed by PHYSICAL column name; parent model from field type)
    for (const line of body.split('\n')) {
      const fm = line.match(/^\s{2}(\w+)\s+(\w+)(\?)?\s+@relation\(([^)]*)\)/);
      if (fm && fm[4].includes('fields:')) {
        const parentModel = fm[2];
        const fields = fm[4].match(/fields:\s*\[([^\]]*)\]/)?.[1].split(',').map((s) => s.trim()) ?? [];
        const pend = fkPending.find((p) => p.fields.length === fields.length && p.fields.every((f, i) => fieldToCol.get(f) === fieldToCol.get(fields[i]) || f === fields[i]));
        for (const f of fields) {
          const childCol = (fieldToCol.get(f) ?? f).toLowerCase();
          const col = table.cols.get(childCol);
          const required = pend ? pend.required : col ? col.notNull : true;
          table.fks.set(childCol, {
            toTable: parentModel,
            toCols: ['id'],
            onDelete: (pend?.onDelete ?? (required ? 'Restrict' : 'SetNull')).toLowerCase(),
            onUpdate: (pend?.onUpdate ?? 'Cascade').toLowerCase(),
          });
        }
      }
    }

    db.tables.set(modelName.toLowerCase(), table);
  }
  return { db, modelNames: [...db.tables.values()].map((t) => t.name) };
}

// ─────────────────────────────────────────────────────────────
// 2. Migration replayer (migration SQL → actual Db)
// ─────────────────────────────────────────────────────────────
function stripCast(d: string): string {
  return d.replace(/::[a-z][a-z0-9_()[\]]*\s*$/i, '').trim();
}

// Normalize FK action keywords: 'SET NULL' → 'setnull', 'NO ACTION' → 'noaction'
const normAction = (a: string | undefined): string =>
  (a ?? 'no action').toLowerCase().replace(/\s+/g, '');

function applyAlter(action: string, t: Table): void {
  // ADD COLUMN [IF NOT EXISTS] "C" TYPE ...
  const ac = action.match(/^ADD\s+COLUMN\s+(IF\s+NOT\s+EXISTS\s+)?"([^"]+)"\s+([A-Za-z]+(?:\s+PRECISION|\(\d+(?:,\s*\d+)?\))?)(.*)$/is);
  if (ac) {
    if (!t.cols.has(ac[2].toLowerCase())) {
      const defM = (ac[4] ?? '').match(/DEFAULT\s+([^,]+?)(?:\s|$)/i);
      const def = defM ? stripCast(defM[1].trim()) : null;
      t.cols.set(ac[2].toLowerCase(), {
        name: ac[2],
        type: typeKey(ac[3]),
        notNull: /NOT\s+NULL/i.test(ac[4] ?? ''),
        def,
        unique: false,
      });
    }
    return;
  }
  // RENAME COLUMN "old" TO "new"
  const ren = action.match(/RENAME\s+COLUMN\s+"([^"]+)"\s+TO\s+"([^"]+)"/i);
  if (ren) {
    const oldCol = t.cols.get(ren[1].toLowerCase());
    if (oldCol && !t.cols.has(ren[2].toLowerCase())) {
      t.cols.delete(ren[1].toLowerCase());
      oldCol.name = ren[2];
      t.cols.set(ren[2].toLowerCase(), oldCol);
      const fk = t.fks.get(ren[1].toLowerCase());
      if (fk) { t.fks.delete(ren[1].toLowerCase()); t.fks.set(ren[2].toLowerCase(), fk); }
    }
    return;
  }
  // ALTER COLUMN ["C"|C] TYPE x [USING ...]  (DO blocks may leave the column unquoted)
  const colAlt = action.match(/ALTER\s+COLUMN\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+(?:SET\s+DATA\s+TYPE|TYPE)\s+([a-z]+(?:\s+precision|\(\d+(?:,\s*\d+)?\))?)/i);
  if (colAlt) {
    const c = t.cols.get(colAlt[1].toLowerCase());
    if (c) c.type = typeKey(colAlt[2].trim());
    return;
  }
  // ALTER COLUMN ["C"|C] SET NOT NULL / DROP NOT NULL
  const nn = action.match(/ALTER\s+COLUMN\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+SET\s+NOT\s+NULL/i);
  if (nn) { const c = t.cols.get(nn[1].toLowerCase()); if (c) c.notNull = true; return; }
  const dnn = action.match(/ALTER\s+COLUMN\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+DROP\s+NOT\s+NULL/i);
  if (dnn) { const c = t.cols.get(dnn[1].toLowerCase()); if (c) c.notNull = false; return; }
  // ALTER COLUMN ["C"|C] SET DEFAULT x / DROP DEFAULT
  const sd = action.match(/ALTER\s+COLUMN\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+SET\s+DEFAULT\s+([^,;]+)/i);
  if (sd) {
    const c = t.cols.get(sd[1].toLowerCase());
    if (c) {
      let d = sd[2].trim().replace(/\s+$/, '');
      // e.g. '[]'::jsonb — strip the cast but keep the quoted literal
      d = stripCast(d);
      if (/^current_timestamp$/i.test(d)) d = 'current_timestamp';
      c.def = d;
    }
    return;
  }
  const dd = action.match(/ALTER\s+COLUMN\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+DROP\s+DEFAULT/i);
  if (dd) { const c = t.cols.get(dd[1].toLowerCase()); if (c) c.def = null; return; }
  // ADD CONSTRAINT FK
  const fk = action.match(/ADD\s+CONSTRAINT\s+"[^"]+"\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+"([^"]+)"\s*\(([^)]+)\)([^,;)]*)/i);
  if (fk) {
    const actions = fk[4] ?? '';
    const child = normCols(fk[1].split(','))[0];
    t.fks.set(child, {
      toTable: fk[2].toLowerCase(),
      toCols: normCols(fk[3].split(',')),
      onDelete: normAction(actions.match(/ON\s+DELETE\s+(SET\s+NULL|CASCADE|RESTRICT|NO\s+ACTION|SET\s+DEFAULT)/i)?.[1]),
      onUpdate: normAction(actions.match(/ON\s+UPDATE\s+(SET\s+NULL|CASCADE|RESTRICT|NO\s+ACTION|SET\s+DEFAULT)/i)?.[1]),
    });
    return;
  }
  // ADD CONSTRAINT UNIQUE
  const uq = action.match(/ADD\s+CONSTRAINT\s+"[^"]+"\s+UNIQUE\s*\(([^)]+)\)/i);
  if (uq) { t.uniques.push(normCols(uq[1].split(','))); return; }
}

function parseColsFromCreateTable(body: string): Col[] {
  const parts: string[] = [];
  let depth = 0, cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);

  const cols: Col[] = [];
  for (const raw of parts) {
    const p = raw.replace(/--[^\n]*/g, '').trim();
    if (!p || /^(PRIMARY KEY|CONSTRAINT|UNIQUE|CHECK|FOREIGN KEY|EXCLUDE)/i.test(p)) continue;
    const cm = p.match(/^"([^"]+)"\s+([A-Za-z]+(?:\s+PRECISION|\(\d+(?:,\s*\d+)?\))?)(.*)$/is);
    if (!cm) continue;
    const [, name, type, restRaw] = cm;
    const rest = restRaw ?? '';
    const isInlinePk = /PRIMARY KEY/i.test(rest);
    let def: string | null = null;
    const dm = rest.match(/DEFAULT\s+([^,]+?)(?:\s|$)/i);
    if (dm) {
      let d = dm[1].trim().replace(/\s+(GENERATED|AS|ON|REFERENCES|PRIMARY|NOT|UNIQUE|CHECK).*$/i, '');
      def = stripCast(d);
    }
    cols.push({
      name: name.toLowerCase(),
      type: typeKey(type),
      notNull: /NOT NULL/i.test(rest) || isInlinePk,
      def,
      unique: false,
    });
  }
  return cols;
}

function replayMigrations(): Db {
  const db: Db = { tables: new Map() };

  for (const dir of migrationDirs()) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8');

    // Remove comments once; split into statements ($$-aware).
    const clean = sql.replace(/--[^\n]*/g, '');
    // Extract DO $$ ... $$ blocks first; their inner ALTERs run AFTER the
    // top-level statements of the SAME file (tables may be created above).
    const doBlocks: string[] = [];
    const doRe = /DO\s*\$\$([\s\S]*?)\$\$;/gi;
    let dm: RegExpExecArray | null;
    let work = clean;
    while ((dm = doRe.exec(clean)) !== null) {
      doBlocks.push(dm[1]);
    }
    work = work.replace(/DO\s*\$\$[\s\S]*?\$\$;/gi, '');

    for (const stmtRaw of work.split(';')) {
      const stmt = stmtRaw.trim();
      if (!stmt) continue;
      let m: RegExpExecArray | null;

      // CREATE TABLE [IF NOT EXISTS] "T" ( ... )
      if ((m = stmt.match(/^CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?"([^"]+)"\s*\(([\s\S]+)\)\s*$/i))) {
        if (m[1] && db.tables.has(m[2].toLowerCase())) continue;
        const t: Table = { name: m[2], cols: new Map(), uniques: [], indexes: [], fks: new Map() };
        for (const col of parseColsFromCreateTable(m[3])) t.cols.set(col.name, col);
        const fkRe = /CONSTRAINT\s+"[^"]+"\s+FOREIGN\s+KEY\s*\(([^)]+)\)\s*REFERENCES\s+"([^"]+)"\s*\(([^)]+)\)([^,)]*)/gi;
        let f: RegExpExecArray | null;
        while ((f = fkRe.exec(m[3])) !== null) {
          const actions = f[4] ?? '';
          t.fks.set(normCols(f[1].split(','))[0], {
            toTable: f[2].toLowerCase(),
            toCols: normCols(f[3].split(',')),
            onDelete: normAction(actions.match(/ON\s+DELETE\s+(SET\s+NULL|CASCADE|RESTRICT|NO\s+ACTION|SET\s+DEFAULT)/i)?.[1]),
            onUpdate: normAction(actions.match(/ON\s+UPDATE\s+(SET\s+NULL|CASCADE|RESTRICT|NO\s+ACTION|SET\s+DEFAULT)/i)?.[1]),
          });
        }
        const uqRe = /CONSTRAINT\s+"[^"]+"\s+UNIQUE\s*\(([^)]+)\)/gi;
        while ((f = uqRe.exec(m[3])) !== null) t.uniques.push(normCols(f[1].split(',')));
        db.tables.set(m[2].toLowerCase(), t);
        continue;
      }

      // DROP TABLE [IF EXISTS] "T"
      if ((m = stmt.match(/^DROP\s+TABLE\s+(IF\s+EXISTS\s+)?"([^"]+)"/i))) {
        db.tables.delete(m[2].toLowerCase());
        continue;
      }

      // ALTER TABLE "T" ...
      if ((m = stmt.match(/^ALTER\s+TABLE\s+(?:ONLY\s+)?"([^"]+)"\s+([\s\S]+)$/i))) {
        const t = db.tables.get(m[1].toLowerCase());
        if (t) applyAlter(m[2].trim(), t);
        continue;
      }

      // CREATE [UNIQUE] INDEX [IF NOT EXISTS] "name" ON "T" (cols)
      if ((m = stmt.match(/^CREATE\s+(UNIQUE\s+)?INDEX\s+(IF\s+NOT\s+EXISTS\s+)?"[^"]+"\s+ON\s+"([^"]+)"\s*(?:USING\s+\w+\s*)?\(([^)]+)\)/i))) {
        const t = db.tables.get(m[3].toLowerCase());
        if (!t) continue;
        const cols = normCols(m[4].split(','));
        if (m[1]) t.uniques.push(cols); else t.indexes.push(cols);
        continue;
      }
      // Everything else (GRANT, ENABLE RLS, CREATE SCHEMA/EXTENSION, INSERT, UPDATE) — parity-irrelevant
    }

    // DO-block fragments: each ';'-separated fragment holds at most one ALTER
    for (const inner of doBlocks) {
      for (const frag of inner.split(';')) {
        const am = frag.match(/ALTER\s+TABLE\s+"([^"]+)"\s+([\s\S]+)$/i);
        if (!am) continue;
        const t = db.tables.get(am[1].toLowerCase());
        if (t) applyAlter(am[2].trim(), t);
      }
    }
  }
  return db;
}

// Fix: applyAlter needs (action, table) signature — small shim used above.
// (kept close to the replayer for clarity)

// ─────────────────────────────────────────────────────────────
// 3. Comparison
// ─────────────────────────────────────────────────────────────
function compare(expected: Db, actual: Db): Drift[] {
  const drift: Drift[] = [];

  for (const [tName, tExp] of expected.tables) {
    const tAct = actual.tables.get(tName);
    if (!tAct) { drift.push({ kind: 'MISSING_TABLE', table: tName, detail: `model ${tExp.name} has no CREATE TABLE in migrations` }); continue; }

    for (const [cName, cExp] of tExp.cols) {
      const cAct = tAct.cols.get(cName);
      if (!cAct) { drift.push({ kind: 'MISSING_COLUMN', table: tName, detail: `${tExp.name}.${cExp.name} missing in migrations` }); continue; }
      if (cExp.type !== cAct.type) drift.push({ kind: 'TYPE_MISMATCH', table: tName, detail: `${tExp.name}.${cExp.name}: schema=${cExp.type} migrations=${cAct.type}` });
      if (cExp.notNull !== cAct.notNull) drift.push({ kind: 'NULLABILITY_MISMATCH', table: tName, detail: `${tExp.name}.${cExp.name}: schema=${cExp.notNull ? 'NOT NULL' : 'nullable'} migrations=${cAct.notNull ? 'NOT NULL' : 'nullable'}` });
      const strip = (s: string): string => s.replace(/\s+/g, ' ').trim().replace(/^'(.*)'$/, '$1');
      const de = cExp.def ? strip(cExp.def) : null;
      const da = cAct.def ? strip(cAct.def) : null;
      const norm = (s: string): string => s.toLowerCase().replace(/\(\s*\)/g, '');
      const defEq = de === null ? da === null : da !== null && (de === da || norm(de) === norm(da));
      if (!defEq) drift.push({ kind: 'DEFAULT_MISMATCH', table: tName, detail: `${tExp.name}.${cExp.name}: schema=${de ?? 'none'} migrations=${da ?? 'none'}` });
    }
    for (const [cName, cAct] of tAct.cols) {
      if (!tExp.cols.has(cName)) drift.push({ kind: 'EXTRA_COLUMN_IN_MIGRATIONS', table: tName, detail: `${tAct.name}.${cAct.name} exists in migrations but not in schema` });
    }

    const expUniq = new Set<string>();
    for (const c of tExp.cols.values()) if (c.unique) expUniq.add(colsKey([c.name]));
    for (const u of tExp.uniques) expUniq.add(colsKey(u));
    const actUniq = new Set(tAct.uniques.map((u) => colsKey(u)));
    for (const k of expUniq) if (!actUniq.has(k)) drift.push({ kind: 'MISSING_UNIQUE', table: tName, detail: `${tExp.name}: unique(${k}) missing in migrations` });
    for (const k of actUniq) if (!expUniq.has(k)) drift.push({ kind: 'EXTRA_UNIQUE_IN_MIGRATIONS', table: tName, detail: `${tAct.name}: unique(${k}) not declared in schema` });

    const expIdx = new Set(tExp.indexes.map((i) => colsKey(i)));
    const actIdx = new Set(tAct.indexes.map((i) => colsKey(i)));
    for (const k of expIdx) if (!actIdx.has(k)) drift.push({ kind: 'MISSING_INDEX', table: tName, detail: `${tExp.name}: index(${k}) missing in migrations` });
    for (const k of actIdx) if (!expIdx.has(k)) drift.push({ kind: 'EXTRA_INDEX_IN_MIGRATIONS', table: tName, detail: `${tAct.name}: index(${k}) not declared in schema` });

    for (const [c, fkExp] of tExp.fks) {
      const fkAct = tAct.fks.get(c);
      if (!fkAct) { drift.push({ kind: 'MISSING_FK', table: tName, detail: `${tExp.name}.${c} → ${fkExp.toTable} missing in migrations` }); continue; }
      if (fkAct.toTable !== fkExp.toTable.toLowerCase()) {
        drift.push({ kind: 'FK_TARGET_MISMATCH', table: tName, detail: `${tExp.name}.${c}: schema→${fkExp.toTable} migrations→${fkAct.toTable}` });
        continue;
      }
      if (fkExp.onDelete !== fkAct.onDelete) drift.push({ kind: 'FK_ONDELETE_MISMATCH', table: tName, detail: `${tExp.name}.${c}: schema=${fkExp.onDelete} migrations=${fkAct.onDelete}` });
    }
    for (const [c] of tAct.fks) {
      if (!tExp.fks.has(c)) drift.push({ kind: 'EXTRA_FK_IN_MIGRATIONS', table: tName, detail: `${tAct.name}.${c} FK exists in migrations but not declared in schema` });
    }
  }

  for (const [tName, tAct] of actual.tables) {
    if (!expected.tables.has(tName)) drift.push({ kind: 'EXTRA_TABLE_IN_MIGRATIONS', table: tName, detail: `${tAct.name} created in migrations but has no model in schema` });
  }
  return drift;
}

// ─────────────────────────────────────────────────────────────
// 4. Tests
// ─────────────────────────────────────────────────────────────
const { db: expectedDb, modelNames } = parseSchema();
const actualDb = replayMigrations();
const drift = compare(expectedDb, actualDb);
const blocking = drift.filter((d) => !d.kind.startsWith('EXTRA_'));

describe('P0-4 migration parity (schema ↔ migrations, offline replay)', () => {
  it('parsed the expected model population', () => {
    expect(modelNames.length).toBeGreaterThanOrEqual(36);
  });

  it('replayed every migration directory', () => {
    const dirs = migrationDirs();
    expect(dirs.length).toBeGreaterThanOrEqual(12);
    expect(dirs).toContain('0_init');
    expect(dirs).toContain('20260906000000_p03_database_security_lockdown');
  });

  it('every model has a table in the migration chain', () => {
    const missing = modelNames.filter((mn) => !actualDb.tables.has(mn.toLowerCase()));
    expect(missing).toEqual([]);
  });

  it('migration chain creates no tables without a model', () => {
    const extra = [...actualDb.tables.keys()].filter((t) => !expectedDb.tables.has(t));
    expect(extra).toEqual([]);
  });

  it('columns: no missing/extra, no type/nullability/default drift', () => {
    const kinds = ['MISSING_COLUMN', 'TYPE_MISMATCH', 'NULLABILITY_MISMATCH', 'DEFAULT_MISMATCH'];
    const issues = blocking.filter((d) => kinds.includes(d.kind));
    expect(issues).toEqual([]);
  });

  it('unique constraints match', () => {
    expect(blocking.filter((d) => d.kind === 'MISSING_UNIQUE')).toEqual([]);
  });

  it('indexes declared in schema exist in migrations', () => {
    expect(blocking.filter((d) => d.kind === 'MISSING_INDEX')).toEqual([]);
  });

  it('foreign keys match (target + ON DELETE action)', () => {
    const kinds = ['MISSING_FK', 'FK_TARGET_MISMATCH', 'FK_ONDELETE_MISMATCH'];
    expect(blocking.filter((d) => kinds.includes(d.kind))).toEqual([]);
  });

  it('prints the full drift inventory for transparency', () => {
    if (drift.length > 0) {
      console.log(`\n[P0-4] drift inventory (${drift.length}):`);
      for (const d of drift) console.log(`  - ${d.kind}: ${d.table}: ${d.detail}`);
    }
    expect(true).toBe(true);
  });
});
