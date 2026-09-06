# P0-⑤ — Encryption + Secrets (Audit, Implementation, Rotation Runbook)

Status: **IMPLEMENTED.** Related: `src/lib/crypto.ts`, `src/lib/crypto-backfill.ts`, `scripts/p05_backfill_secrets.ts`, `tests/crypto-p2-6.test.ts`, `tests/secrets-p0-5.test.ts`.

---

## A. What was inspected

| Item | Finding |
|---|---|
| `ENCRYPTION_MASTER_KEY` | Required by crypto module to be exactly 32 bytes, base64. Missing key ⇒ `encryptSecret`/`decryptSecret` throw (fail-closed). Wrong-length key ⇒ throws. |
| `src/lib/crypto.ts` | AES-256-GCM, versioned `v1:<iv>:<authTag>:<ciphertext>`, random 12-byte IV per encryption, auth-tag verification, explicit `isEncrypted()`. Verified by 13 unit tests (roundtrip, wrong key, no key, malformed, empty, long). |
| `WebhookEndpoint.secret` | The only secret-at-rest column in the schema. Read paths (`webhook-delivery.ts`, `handlers/webhook-handler.ts`) decrypt via `decryptSecret` and **fail closed** on decryption failure (webhook processing aborts with an explicit error — never silently unsigned). Plaintext passthrough exists ONLY as a documented migration bridge (`isEncrypted()` gate). |
| Secret write paths | The application has NO webhook-endpoint CRUD route (endpoints are operator-managed). Therefore encryption-at-rest is enforced by the backfill CLI + rotation runbook, and read paths accept both formats during the migration window. |
| `ApiKey.key` | **P0-⑥ scope** (hashing/rotation/behavior tests) — see next phase. |
| Passwords | `bcrypt` cost 12 (`src/lib/auth.ts`), strength validation on create/update, `passwordHash` never included in any user response (explicit `select` lists verified). |
| `SESSION_SECRET` | Optional/reserved; sessions are DB-backed random tokens (`Session` table). No JWT signing secret in use — nothing to leak. |
| Logs | `logger` call sites in webhook delivery/handler document "never log the secret or full payload"; backfill logs counts/ids only (asserted by test). |
| API responses | User routes: explicit `select` excluding `passwordHash`. Webhook secret never returned by any route (no CRUD routes exist). |

## B. Fail-closed matrix

| Scenario | Behavior |
|---|---|
| Encrypt without key | Throws — operation refused |
| Decrypt `v1:` secret without key | Throws — webhook processing aborts |
| Decrypt with wrong key | Throws (GCM auth failure) — never returns garbage |
| Corrupted ciphertext | Throws — never silently passthrough |
| Plaintext secret (pre-backfill) | Passthrough works (migration window), backfill converts to `v1:` |
| Backfill without key | CLI refuses to start (exit 1), DB untouched (asserted by test) |

## C. Operator: enabling encryption + backfilling (REQUIRED once)

1. Generate and install the master key (Vercel + local env, never commit):
   ```bash
   openssl rand -base64 32   # → ENCRYPTION_MASTER_KEY
   ```
2. Run the idempotent backfill against production:
   ```bash
   ENCRYPTION_MASTER_KEY="$KEY" DATABASE_URL="$URL" npx tsx scripts/p05_backfill_secrets.ts
   ```
   Output is counts only: `scanned / already encrypted / newly encrypted / failed`.
3. Re-run to confirm idempotency (`newly encrypted: 0`).
4. Verify: `SELECT count(*) FROM "WebhookEndpoint" WHERE secret NOT LIKE 'v1:%';` → must be `0`.

## D. Rotation runbook

### D.1 Rotate a webhook endpoint secret
1. Generate new secret: `openssl rand -base64 32`.
2. Encrypt it: `node -e "const {encryptSecret}=require('./src/lib/crypto'); console.log(encryptSecret(process.argv[1]))" "$NEW"` (with key env set) — or write via the delivery library helper.
3. Update the endpoint row and the receiver side simultaneously (dual-accept window if the receiver supports it: accept old+new signature timestamps).
4. Deliveries use the new secret immediately on next event (secret is read per delivery).

### D.2 Rotate ENCRYPTION_MASTER_KEY (key rotation)
1. Generate `ENCRYPTION_MASTER_KEY_V2`.
2. Deploy code path: decrypt with old key, re-encrypt with new key per row (backfill script variant; keep both keys in env during transition).
3. Run re-encrypt (idempotent), verify `v1:` rows decrypt under V2, then remove V1 from env.
4. Never log either key. Roll both keys in one maintenance window.

### D.3 Compromised secret incident
1. Revoke the leaked credential at the receiver side first.
2. Rotate per D.1/D.2.
3. Audit `AuditLog` + `WebhookDelivery` for anomalous usage in the exposure window.

## E. Rules enforced by tests

- Backfill encrypts plaintext rows, skips `v1:` rows (idempotent), and writes nothing when the key is absent (fail-closed).
- No secret value ever reaches the logger (behavioral assertion).
- Roundtrip + wrong-key + no-key crypto semantics remain enforced (P2-6 suite).
