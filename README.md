# serverless-booking-system
サーバーレス予約システムのリポジトリ

IMPORTANT SECURITY NOTE
-----------------------
This repository previously contained sensitive files (tokens, API keys) in development. We removed client-side admin secrets and added tools to help safely purge any remaining secrets from the git history.

If you previously committed any tokens or secret files (e.g. `token.txt`, `apiKey.txt`), immediately revoke those credentials at the provider and then use `tools/remove-secrets/purge-secrets.sh` or follow the instructions in `tools/remove-secrets/README.md` to purge the secrets from the repo history.

If you want, I can run the history-purge steps for you — note this requires force-pushing rewritten history and coordination with your team.
