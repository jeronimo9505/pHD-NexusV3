import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { authorizationUrl, tokenRequest, verifyDrive } from './google-oauth-probe.mjs';

const url = new URL(authorizationUrl('client', 'http://127.0.0.1:8765/oauth/callback', 'state', 'verifier'));
assert.equal(url.origin, 'https://accounts.google.com');
for (const [key, value] of Object.entries({ access_type: 'offline', prompt: 'consent', state: 'state',
    code_challenge_method: 'S256', scope: 'https://www.googleapis.com/auth/drive.file' })) {
    assert.equal(url.searchParams.get(key), value);
}
assert.equal(url.searchParams.get('code_challenge'), crypto.createHash('sha256').update('verifier').digest('base64url'));
const requests = [];
const fetcher = async (endpoint, options) => {
    requests.push({ endpoint, options });
    return { ok: true, json: async () => ({ access_token: 'new-access', expires_in: 3600 }) };
};
const tokens = await tokenRequest({ client_id: 'client', refresh_token: 'test-refresh', grant_type: 'refresh_token' }, fetcher);
assert.equal(tokens.access_token, 'new-access');
assert.equal(requests[0].options.body.get('grant_type'), 'refresh_token');
assert.equal(requests[0].endpoint, 'https://oauth2.googleapis.com/token');
await verifyDrive(tokens.access_token, fetcher);
assert.equal(requests[1].options.headers.Authorization, 'Bearer new-access');
assert.match(requests[1].endpoint, /fields=kind$/);
await assert.rejects(tokenRequest({}, async () => ({ ok: false, json: async () => ({ error_description: 'secret-must-not-leak' }) })), error => !error.message.includes('secret-must-not-leak'));
await assert.rejects(verifyDrive('token', async () => ({ ok: false, status: 401 })), /HTTP 401/);
console.log('OAuth probe: PKCE, offline consent, refresh exchange, read-only verification and redacted errors passed');
