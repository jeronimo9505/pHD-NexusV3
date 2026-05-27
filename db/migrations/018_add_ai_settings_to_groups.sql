-- Migration: Add AI settings to groups
ALTER TABLE groups ADD COLUMN IF NOT EXISTS ai_settings JSONB DEFAULT '{}'::jsonb;
