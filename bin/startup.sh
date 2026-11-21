#!/usr/bin/env bash
# Starts link-organizer-api with configuration from the link-mgmnt dotenv file.
#
#   bin/startup.sh            build if needed, then run dist/server.js
#   bin/startup.sh --build    always rebuild first
#
# ENV_FILE overrides the config location (default /etc/app-configs/link-mgmnt/.env).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="/etc/app-configs/link-mgmnt"
ENV_FILE="${ENV_FILE:-$CONFIG_DIR/.env}"

# Accept the config directory itself as ENV_FILE, too.
if [[ -d "$ENV_FILE" ]]; then
  ENV_FILE="$ENV_FILE/.env"
fi

if [[ ! -r "$ENV_FILE" ]]; then
  echo "startup: config file not found or not readable: $ENV_FILE" >&2
  echo "startup: copy $APP_DIR/.env.example there and fill it in" >&2
  exit 1
fi

cd "$APP_DIR"

if [[ ! -d node_modules ]]; then
  echo "startup: installing dependencies"
  npm ci
fi

if [[ "${1:-}" == "--build" || ! -f dist/server.js ]]; then
  echo "startup: building"
  npm run build
fi

echo "startup: using config $ENV_FILE"
export DOTENV_CONFIG_PATH="$ENV_FILE"
export NODE_ENV="${NODE_ENV:-production}"
exec node --enable-source-maps dist/server.js
