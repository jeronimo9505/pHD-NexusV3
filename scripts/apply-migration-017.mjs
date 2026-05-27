import https from 'https';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sql = fs.readFileSync(join(__dirname, '../db/migrations/017_add_ai_chat_tables.sql'), 'utf8');
const serviceRoleKey = 'sb_secret_3Z7LfvWq-hYpABhvcXvObA_KFchc9t2';
const projectRef = 'rufjebyqbdpdgnofuzaq';

const body = JSON.stringify({ query: sql });

const req = https.request({
    hostname: 'api.supabase.com',
    path: `/v1/projects/${projectRef}/database/query`,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': 'Bearer ' + serviceRoleKey,
    }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data);
    });
});
req.on('error', e => console.error('Error:', e));
req.write(body);
req.end();
