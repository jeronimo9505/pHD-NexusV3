-- Seed 001: Example Users
-- Description: Creates example users for development

INSERT INTO profiles (id, email, full_name, system_role, status) VALUES
    ('00000000-0000-0000-0000-000000000001', 'admin@phdnexus.com', 'Admin User', 'admin', 'active'),
    ('00000000-0000-0000-0000-000000000002', 'supervisor@phdnexus.com', 'Dr. Supervisor', 'user', 'active'),
    ('00000000-0000-0000-0000-000000000003', 'student@phdnexus.com', 'PhD Student', 'user', 'active')
ON CONFLICT (id) DO NOTHING;
