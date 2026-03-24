#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/asomark"
BRANCH="${1:-main}"

echo "==> Deploying ASOMARK from branch: $BRANCH"

cd "$APP_DIR"

# Pull latest code
echo "==> Pulling latest changes..."
git fetch origin
git reset --hard "origin/$BRANCH"

# Install dependencies
echo "==> Installing dependencies..."
corepack enable
yarn install --immutable

# Build shared types
echo "==> Building shared package..."
yarn workspace @asomark/shared build 2>/dev/null || true

# Build backend
echo "==> Building backend..."
yarn build:backend

# Build dashboard
echo "==> Building dashboard..."
yarn build:dashboard

# Run database migrations
echo "==> Running database migrations..."
yarn db:migrate

# Restart services
echo "==> Restarting Docker services (Postgres + Redis)..."
docker compose -f docker-compose.prod.yml up -d

# Restart backend via systemd
echo "==> Restarting backend..."
sudo systemctl restart asomark-backend

# Reload Nginx (in case config changed)
echo "==> Reloading Nginx..."
sudo nginx -t && sudo systemctl reload nginx

echo "==> Deploy complete!"
echo "    Dashboard: https://asomark.afk.codes"
echo "    API:       https://asomark.afk.codes/api/"
