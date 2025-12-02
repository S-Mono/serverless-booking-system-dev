# Removing secrets from Git history

This folder contains guidance and helper scripts to remove sensitive files (tokens, API keys, service account files) from the repository history.

WARNING: Purging history requires rewriting git history and force-pushing. Coordinate with your team and make backups before proceeding.

Options

- BFG Repo-Cleaner (simple) — recommended for common cases.
- git-filter-repo (powerful and faster) — recommended for complex filters.

Example workflows

1) Using BFG (simpler):

```bash
# Mirror clone
git clone --mirror git@github.com:<owner>/<repo>.git repo.git
cd repo.git
# Remove files named token.txt and apiKey.txt
bfg --delete-files token.txt
bfg --delete-files apiKey.txt
# Cleanup
git reflog expire --expire=now --all
git gc --prune=now --aggressive
# Push back
git push --force
```

2) Using git-filter-repo (recommended):

```bash
# Clone repo (bare or mirror recommended)
git clone --mirror git@github.com:<owner>/<repo>.git repo.git
cd repo.git
# Remove paths from history
git filter-repo --path token.txt --path apiKey.txt --invert-paths
# Push back (force)
git push --force --all
git push --force --tags
```

3) If you also exposed tokens (e.g. GitHub PAT, Firebase credentials):
 - Revoke/rotate the credentials at each provider immediately.
 - After rotation, proceed with history purge.

Helper script (purge-secrets.sh)
- There's a convenience script included below — it only prints the commands and doesn't force anything by default. Review and run manually.
