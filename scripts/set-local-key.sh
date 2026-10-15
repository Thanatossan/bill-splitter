#!/bin/sh
# Save your Anthropic API key for local development only.
# It goes in .env.development.local (git-ignored, excluded from Vercel uploads,
# and untouched by `vercel env pull`). `npm run dev` picks it up automatically.
set -e
cd "$(dirname "$0")/.."
FILE=.env.development.local

printf "Paste your Anthropic API key (hidden), then press Enter: "
stty -echo
read -r key
stty echo
echo

case "$key" in
  sk-ant-*) ;;
  *) echo "That doesn't look like an Anthropic API key (should start with sk-ant-). Nothing saved."; exit 1 ;;
esac

touch "$FILE"
grep -v '^ANTHROPIC_API_KEY=' "$FILE" > "$FILE.tmp" || true
echo "ANTHROPIC_API_KEY=$key" >> "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
chmod 600 "$FILE"
echo "Saved to $FILE. Open http://localhost:3000/new to try scanning."
