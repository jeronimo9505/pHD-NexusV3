// Isolated, read-only OAuth experiment. Credentials and tokens are never written.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function authorizationUrl(clientId, redirectUri, state, verifier) {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri,
        response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.file',
        access_type: 'offline', prompt: 'consent', state,
        code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256' }).toString();
    return url.toString();
}

export async function tokenRequest(parameters, fetcher = fetch) {
    const response = await fetcher('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(parameters), signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok || !result.access_token) throw new Error('Google no pudo emitir el permiso. Revisa el cliente, la URL de retorno y el consentimiento.');
    return result;
}

export async function verifyDrive(accessToken, fetcher = fetch) {
    // Only request the response type; do not retrieve file names or contents.
    const response = await fetcher('https://www.googleapis.com/drive/v3/files?pageSize=1&fields=kind', {
        headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Drive rechazó la comprobación (HTTP ${response.status}). Comprueba que la API esté habilitada y el permiso concedido.`);
}

async function main() {
    const args = process.argv.slice(2);
    const credentialIndex = args.indexOf('--credentials');
    const credentialPath = credentialIndex >= 0 ? args[credentialIndex + 1] : null;
    if (!credentialPath || credentialPath.startsWith('--')) throw new Error('Uso: node scripts/google-oauth-probe.mjs --credentials RUTA_JSON [--no-open]');
    const absolute = fs.realpathSync(credentialPath);
    const root = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
    const relative = path.relative(root, absolute);
    if (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) throw new Error('Guarda el JSON de credenciales fuera del repositorio.');
    const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    const config = parsed.web || parsed.installed;
    if (!config?.client_id) throw new Error('El JSON no contiene un cliente OAuth web o desktop válido.');
    const port = 8765;
    const origin = `http://127.0.0.1:${port}`;
    const redirectUri = `${origin}/oauth/callback`;
    if (parsed.web && !config.redirect_uris?.includes(redirectUri)) throw new Error(`Añade ${redirectUri} a las URI de redirección autorizadas del cliente web y descarga el JSON actualizado. No cambies las URI existentes.`);
    let state = '', verifier = '', consumed = false, refreshToken = '', busy = false;
    let refreshes = 0;
    const page = (message, action = '') => `<!doctype html><html lang="es"><meta charset="utf-8"><title>Prueba de conexión Google</title><body><h1>Prueba de conexión Google</h1><p>${message}</p>${action}<p>No se crean ni modifican archivos. Los permisos se eliminan de la memoria al cerrar esta prueba.</p></body></html>`;
    const retry = '<a href="/">Volver al inicio</a>';
    const refreshButton = '<form method="post" action="/refresh"><button>Probar renovación sin otra ventana</button></form>';
    const server = http.createServer(async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'same-origin');
        res.setHeader('Content-Security-Policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        if (req.headers.host !== `127.0.0.1:${port}`) { res.writeHead(400); res.end(); return; }
        const url = new URL(req.url, origin);
        try {
            if (req.method === 'GET' && url.pathname === '/') {
                res.end(page('Esta prueba usa el navegador predeterminado de Windows. Al conectar, Google solicitará permiso para archivos usados por esta prueba.', '<a href="/connect">Conectar Google para la prueba</a>')); return;
            }
            if (req.method === 'GET' && url.pathname === '/connect') {
                if (busy) { res.writeHead(409); res.end(page('Ya hay una operación en curso.', retry)); return; }
                state = crypto.randomBytes(32).toString('base64url');
                verifier = crypto.randomBytes(48).toString('base64url');
                consumed = false;
                res.writeHead(302, { Location: authorizationUrl(config.client_id, redirectUri, state, verifier) }); res.end(); return;
            }
            if (req.method === 'GET' && url.pathname === '/oauth/callback') {
                const received = url.searchParams.get('state') || '';
                if (!state || consumed || received.length !== state.length || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(state))) {
                    res.writeHead(400); res.end(page('Respuesta de autorización no válida o ya utilizada.', retry)); return;
                }
                consumed = true;
                if (url.searchParams.has('error') || !url.searchParams.get('code')) { res.writeHead(400); res.end(page('La autorización no se completó.', retry)); return; }
                busy = true;
                try {
                    const tokens = await tokenRequest({ client_id: config.client_id,
                        ...(config.client_secret ? { client_secret: config.client_secret } : {}),
                        code: url.searchParams.get('code'), code_verifier: verifier,
                        redirect_uri: redirectUri, grant_type: 'authorization_code' });
                    refreshToken = tokens.refresh_token || '';
                    await verifyDrive(tokens.access_token);
                    console.log('Acceso inicial a Drive comprobado. Credencial de renovación:', refreshToken ? 'recibida' : 'NO recibida');
                    res.writeHead(303, { Location: '/connected' }); res.end(); return;
                } finally { busy = false; verifier = ''; }
            }
            if (req.method === 'GET' && url.pathname === '/connected') {
                res.end(page(refreshToken ? `Conexión inicial comprobada. Renovaciones verificadas: ${refreshes}. Puedes renovar ahora sin esperar una hora.` : 'Google no entregó una credencial de renovación. Hay que revisar el consentimiento antes de continuar.', refreshToken ? refreshButton : retry)); return;
            }
            if (req.method === 'POST' && url.pathname === '/refresh') {
                if (req.headers.origin !== origin || !refreshToken || busy) { res.writeHead(403); res.end(page('No se puede renovar esta sesión de prueba.', retry)); return; }
                busy = true;
                try {
                    const tokens = await tokenRequest({ client_id: config.client_id,
                        ...(config.client_secret ? { client_secret: config.client_secret } : {}),
                        refresh_token: refreshToken, grant_type: 'refresh_token' });
                    if (tokens.refresh_token) refreshToken = tokens.refresh_token;
                    await verifyDrive(tokens.access_token);
                    refreshes++;
                    console.log(`Renovación ${refreshes} comprobada sin ventana de autorización.`);
                    res.writeHead(303, { Location: '/connected' }); res.end(); return;
                } finally { busy = false; }
            }
            res.writeHead(404); res.end();
        } catch {
            // Never print token responses, callback URLs, codes or credentials.
            res.writeHead(502); res.end(page('La comprobación falló. Revisa la configuración OAuth, la API Drive y la conexión. No se modificaron archivos.', retry));
        }
    });
    server.on('error', () => { console.error('No se pudo abrir el puerto local 8765. Cierra otra prueba que lo esté usando.'); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => {
        console.log(`Prueba local: ${origin}. No compartas esta sesión. Ctrl+C para terminar.`);
        if (!args.includes('--no-open') && process.platform === 'win32') {
            const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process -WindowStyle Hidden '${origin}'`], { windowsHide: true, stdio: 'ignore' });
            child.on('error', () => console.log('Abre la dirección local anterior en tu navegador.'));
        }
    });
    const stop = () => { refreshToken = ''; verifier = ''; state = ''; server.close(); server.closeAllConnections(); };
    const timer = setTimeout(stop, 20 * 60 * 1000);
    timer.unref();
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(() => { console.error('No se pudo preparar la prueba. Comprueba que indicaste un JSON OAuth fuera del repositorio y que autoriza http://127.0.0.1:8765/oauth/callback. Consulta PRUEBA-GOOGLE-DESKTOP.md.'); process.exitCode = 1; });
}
