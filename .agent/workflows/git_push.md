---
description: how to push code to GitHub
---

# Git Push - Always use pHD-NexusV3

> **IMPORTANT**: This project has TWO git remotes. Always push to `v3` (pHD-NexusV3), NOT to `origin` (pHD-NexusV2).

## Remotes
- `origin` → https://github.com/jeronimo9505/pHD-NexusV2 (**DO NOT use this**)
- `v3` → https://github.com/jeronimo9505/pHD-NexusV3 (**Always use this**)

## Correct Push Command

```bash
git add .
git commit -m "feat/fix: describe changes"
git push v3 main
```

## Never use
```bash
git push origin main  # ❌ This goes to the wrong repo (V2)
git push              # ❌ Default goes to origin (V2)
```
