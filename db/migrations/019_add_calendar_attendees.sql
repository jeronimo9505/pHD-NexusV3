-- Migration 019: Add attendees to calendar_events
-- Stores a list of invited email addresses per event

ALTER TABLE calendar_events
ADD COLUMN IF NOT EXISTS attendees TEXT[] DEFAULT '{}';
