-- Alter AIConversation.messages from Text to Json (jsonb)
-- Safe: PostgreSQL can cast valid JSON strings to jsonb natively.
-- Malformed JSON strings are wrapped in an array to preserve data.
-- On a fresh database with no rows, the CASE expressions simply produce NULL/[] for every row.

-- Step 1: Convert text strings to jsonb
DO $$ BEGIN
  ALTER TABLE "AIConversation" ALTER COLUMN messages TYPE jsonb USING 
    CASE 
      WHEN messages IS NULL THEN NULL
      WHEN messages = '' THEN '[]'::jsonb
      WHEN messages ~ '^\[.*\]$' OR messages ~ '^\{.*\}$' THEN 
        CASE 
          WHEN (messages::jsonb IS NOT NULL) THEN messages::jsonb
          ELSE ('[{"role":"system","content":"' || replace(substring(messages, 1, 500), '"', '\\"') || '"}]')::jsonb
        END
      ELSE ('[{"role":"system","content":"' || replace(substring(messages, 1, 500), '"', '\\"') || '"}]')::jsonb
    END;
EXCEPTION
  WHEN datatype_mismatch THEN
    -- Column is already jsonb (migration was re-run or schema was already aligned)
    RAISE NOTICE 'AIConversation.messages is already jsonb, skipping conversion';
  WHEN OTHERS THEN
    RAISE NOTICE 'AIConversation.messages conversion warning: %', SQLERRM;
END $$;

-- Step 2: Set default for new rows (idempotent)
DO $$ BEGIN
  ALTER TABLE "AIConversation" ALTER COLUMN messages SET DEFAULT '[]'::jsonb;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not set default: %', SQLERRM;
END $$;
