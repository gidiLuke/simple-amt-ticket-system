#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$HOME/simple-amt-ticket-system"
VENV_BIN="$HOME/.virtualenvs/amt-tickets/bin"
WSGI_FILE="${WSGI_FILE:-/var/www/<your-username>_pythonanywhere_com_wsgi.py}"

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "Repository not found at $REPO_DIR. Clone it first."
  exit 1
fi

cd "$REPO_DIR"
git pull --ff-only origin main

"$VENV_BIN/pip" install -r backend/requirements.txt

if [ ! -f "$WSGI_FILE" ]; then
  echo "WSGI file not found: $WSGI_FILE"
  exit 1
fi

touch "$WSGI_FILE"
echo "Deployment complete: code updated and web app reloaded."

