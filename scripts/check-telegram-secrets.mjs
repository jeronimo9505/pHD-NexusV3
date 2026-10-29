import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

// Report locations only, never a matching credential or source line.
export function scanTelegramSecrets(text, file) {
    if (text.includes('\0')) return [];
    const findings=[];
    for (const [index,line] of text.split(/\r?\n/).entries()) {
        if (/\b\d{6,12}:[A-Za-z0-9_-]{30,}\b/.test(line)) findings.push({file,line:index+1,reason:'Telegram bot credential in tracked text'});
    }
    if (/(^|\/)\.env(?:\.[^/]+)?$/.test(file) && !file.endsWith('.example')) {
        for (const [index,line] of text.split(/\r?\n/).entries()) {
            const assignment=line.match(/^\s*TELEGRAM_BOT_TOKEN\s*=\s*["']?([^\s"'#]*)/);
            if (assignment?.[1] && !assignment[1].startsWith('encrypted:')) findings.push({file,line:index+1,reason:'Unencrypted Telegram credential configuration'});
        }
    }
    return findings;
}
function git(...args) {return execFileSync('git',args,{encoding:'utf8',maxBuffer:64*1024*1024});}
export function auditTrackedSecrets(base=process.env.SECURITY_SCAN_BASE) {
    const findings=[];
    for (const file of git('ls-files','-z').split('\0').filter(Boolean)) {
        if (/(^|\/)\.env\.(local|keys|.*\.local)$/.test(file)) findings.push({file,line:1,reason:'Private environment file is tracked'});
        if (fs.existsSync(file) && fs.statSync(file).isFile()) findings.push(...scanTelegramSecrets(fs.readFileSync(file,'utf8'),file));
    }
    // Catch credentials added then removed in separate commits of the same push.
    if (base && /^[0-9a-f]{40}$/i.test(base) && !/^0+$/.test(base)) {
        for (const revision of git('rev-list',`${base}..HEAD`).trim().split('\n').filter(Boolean)) {
            const files=git('diff-tree','--root','--no-commit-id','--name-only','--diff-filter=AM','-r','-z',revision).split('\0').filter(Boolean);
            for (const file of files) findings.push(...scanTelegramSecrets(git('show',`${revision}:${file}`),file).map(finding=>({...finding,revision:revision.slice(0,12)})));
        }
    }
    return findings;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const findings=auditTrackedSecrets();
        if(findings.length) {
            for(const finding of findings)console.error(`${finding.revision||'working-tree'} ${finding.file}:${finding.line}: ${finding.reason}`);
            process.exitCode=1;
        } else console.log('PASS Telegram secret guard: no plaintext bot tokens in tracked files or checked new commits');
    } catch {console.error('Secret scan could not complete. Check repository access and base revision.');process.exitCode=1;}
}
