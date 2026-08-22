-- Fix BackgroundJob.priority default: migration had DEFAULT 0, schema expects DEFAULT 5
ALTER TABLE "BackgroundJob" ALTER COLUMN "priority" SET DEFAULT 5;
