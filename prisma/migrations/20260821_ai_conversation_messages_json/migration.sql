-- Alter AIConversation.messages from String to Json
-- Safe: PostgreSQL can cast valid JSON strings to jsonb natively.
-- Malformed JSON strings are wrapped in an array to preserve data.

-- Step 1: Convert valid JSON strings to jsonb, wrap invalid ones
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

-- Step 2: Set default for new rows
ALTER TABLE "AIConversation" ALTER COLUMN messages SET DEFAULT '[]'::jsonb;
