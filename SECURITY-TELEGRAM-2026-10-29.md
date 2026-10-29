# Telegram credential incident — 29 October 2026

## Findings and containment

The reported commit `6908592a7ab712ae8a3af075dc0853a216ba9f37` contains a plaintext Telegram bot credential in the logbook send route. The current source already reads the credential from the server environment; a scan of the tracked current tree found no plaintext Telegram tokens. The reported token's live validity was not tested. The owner confirmed BotFather reported that it was replaced, and supplied a new credential for configuration.

The replacement was installed in the ignored `.env.local` and the existing sensitive Vercel variable for Production and Preview. Only the Telegram entry in the tracked dotenvx `.env` was updated, using its existing public encryption key. That file remains ciphertext; no private decryption key or plaintext token was added to Git. The local repository history contains no commits tracking `.env.keys` or `.env.local`.

Restart the local Next.js/Tauri development process to ensure the local replacement is loaded. New Vercel deployments use the updated protected variable. No Telegram messages were sent as part of the verification. Environment installation and deployment checks do not establish that the Telegram integration works end to end; an authenticated functional check can be performed separately.

## Code changes

- Logbook sends require active membership before any bot request. Reply lookups are restricted to the selected group.
- Media downloads require a session, a visible logbook attachment and active membership of its group. Private media is no longer served with public cache headers.
- Deletion verifies the group and successful database deletion before attempting Telegram synchronization.
- Telegram failure logs omit raw request errors and response bodies, which can contain credential-bearing URLs or private message data.
- Local environment variants are ignored. `.env.example` documents the two server-only Telegram variables with empty values.
- `scripts/check-telegram-secrets.mjs` reports only file/line locations, never matching tokens. GitHub Actions scans tracked current files and changed files in new commits, including a token added and removed within one push. This is a focused Telegram guard, not a comprehensive all-provider secret scanner. CI detects an exposure after a push; GitHub push protection and required checks can add enforcement before merging.

The CI checkout encountered the pre-existing unconfigured `scratch/SPECTROview` gitlink. The scan removes that external link only from its ephemeral runner index and clears the checkout credential before scanning. It does not remove local files or change the repository's scientific data or submodule references.

## Verification

`node scripts/test-telegram-security.mjs` uses synthetic credentials and mocked HTTP/database calls. It checks anonymous/inactive access rejection, attachment ownership lookup, deletion confirmation, private media caching and credential-free error logs. Run the guard, TypeScript and targeted ESLint as well. Never test by placing a real token in a tracked test fixture.

## Historical commits and recovery

The old value remains in historical commits and may exist in clones, caches or forks. Revocation is the containment step; deleting the visible line or rewriting Git cannot invalidate copies held elsewhere. See Telegram's official token guidance: https://core.telegram.org/bots/tutorial#obtain-your-bot-token.

No force-push or history rewrite was performed. Removing the old value from all branches/tags would rewrite commit identities, disrupt existing clones and invalidate previous rollback references; it is a separate coordinated operation. Do not restore the revoked credential during a code rollback. Keep the replacement in Vercel and private local configuration. If reverting this hardening change, preserve the credential rotation even if individual route changes need adjustment.

Baseline before the hardening: `c999c61` / `canvas-grid-guard-2026-10-29`. No scientific data or original WIP/HDF5 files are affected.
