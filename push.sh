#!/bin/bash
set -e
cd /workspace/selfie-booth
git add -A
git commit -q -m "Finalize: fix next config for Vercel deploy, add gitignore" || true
# read the github credential line (user:token@github.com)
CRED=$(grep 'github.com' ~/.git-credentials | head -1)
# strip the https:// prefix to get user:token@github.com
CRED_BARE=$(printf '%s' "$CRED" | sed -E 's#^https://##')
git remote remove origin 2>/dev/null || true
git remote add origin "https://${CRED_BARE}"
git push -u origin main 2>&1 | tail -15
