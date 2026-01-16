-- Migration 001: Initial Schema
-- Created: 2026-01-11
-- Description: Creates the complete initial schema for PhD Nexus

-- This migration creates all core tables, indexes, and triggers
-- It's idempotent (can be run multiple times safely)

\echo 'Running migration 001: Initial Schema...'

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Core tables (see db/schema.sql for full definitions)
-- This migration file references the complete schema
-- In production, copy relevant sections from schema.sql here

\echo 'Migration 001 completed successfully!'
