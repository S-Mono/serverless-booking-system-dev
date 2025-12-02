#!/usr/bin/env bash
set -euo pipefail

echo "This script will show suggested commands to purge secrets from git history. It does NOT run them automatically."
echo "Follow the printed commands carefully — rewriting history is destructive and requires team coordination."

REPO_SSH_URL="git@github.com:your/repo.git" # <- change this to your repo
READONLY_FILES=("token.txt" "apiKey.txt" "serviceAccountKey.json" "*.serviceAccount.json")

echo
echo "Suggested (BFG) workflow (example):"
echo "----------------------------------"
echo "git clone --mirror ${REPO_SSH_URL} repo.git"
echo "cd repo.git"
for f in "${READONLY_FILES[@]}"; do
  echo "bfg --delete-files ${f}"
done
echo "git reflog expire --expire=now --all"
echo "git gc --prune=now --aggressive"
echo "git push --force"

echo
echo "Suggested (git-filter-repo) workflow (example):"
echo "-----------------------------------------------"
files_to_args=""
for f in "${READONLY_FILES[@]}"; do
  files_to_args+=" --path ${f}"
done
echo "git clone --mirror ${REPO_SSH_URL} repo.git"
echo "cd repo.git"
echo "git filter-repo --invert-paths ${files_to_args}"
echo "git push --force --all"
echo "git push --force --tags"

echo
echo "REMEMBER: Revoke any leaked keys immediately at the provider (GitHub, Firebase, etc)."
