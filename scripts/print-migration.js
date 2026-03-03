import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load env vars
dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function applyMigration() {
    console.log('Applying migration...');

    const migrationPath = path.join(process.cwd(), 'db', 'migrations', '016_add_drive_report_comments.sql');

    try {
        const sql = fs.readFileSync(migrationPath, 'utf8');
        console.log(`Read migration file: ${migrationPath}`);

        // We can't execute raw SQL with supabase-js client directly on the database unless using RPC or if we had direct connection.
        // However, we can try to use the REST API if we had a function to exec sql, but we don't.
        // Wait, the user might not have a way to execute this script if it relies on a service key that might not be in .env.local (it usually is).

        // Actually, if we have the service role key, we can use the "rpc" method if there is a function to exec sql.
        // But usually there isn't one by default for security.

        console.log('----------------------------------------------------------------');
        console.log('Please copy and run the following SQL in your Supabase Dashboard SQL Editor:');
        console.log('----------------------------------------------------------------');
        console.log(sql);
        console.log('----------------------------------------------------------------');

    } catch (error) {
        console.error('Error reading migration file:', error);
    }
}

applyMigration();
