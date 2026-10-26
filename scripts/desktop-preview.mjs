import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function previewPlan(nextCli) {
    return [[process.execPath, [nextCli, 'build', '--webpack']],
        [process.execPath, [nextCli, 'start', '--port', '3000']]];
}

export const portInUse = (host, port = 3000) => new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    const finish = result => { socket.destroy(); resolve(result); };
    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
});

async function main() {
    const nextCli = createRequire(import.meta.url).resolve('next/dist/bin/next');
    const plan = previewPlan(nextCli);
    if (process.argv.includes('--plan')) { console.log(JSON.stringify(plan)); return; }
    if ((await Promise.all(['127.0.0.1', '::1'].map(host => portInUse(host)))).some(Boolean)) {
        throw new Error('Port 3000 is already in use. Stop the current Tauri/Next development session with Ctrl+C, then run npm run tauri:perf.');
    }
    if (process.argv.includes('--check')) { console.log('Port 3000 is available for the compiled desktop preview.'); return; }
    let child;
    let stopping = false;
    const stop = () => { stopping = true; child?.kill(); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
        for (const [command, args] of plan) {
            if (stopping) break;
            console.log(args.includes('build') ? 'Building the optimized desktop frontend once…' : 'Starting compiled Next.js at http://localhost:3000');
            const code = await new Promise((resolve, reject) => {
                child = spawn(command, args, { stdio: 'inherit', cwd: path.resolve(fileURLToPath(new URL('..', import.meta.url))),
                    env: { ...process.env, NODE_ENV: 'production', NEXT_PUBLIC_NEXUS_PERFORMANCE: '1' } });
                child.once('error', reject);
                child.once('exit', (exitCode, signal) => resolve(signal ? 1 : exitCode ?? 1));
            });
            if (code !== 0 && !stopping) throw new Error(`Desktop frontend exited with code ${code}`);
        }
    } finally {
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
