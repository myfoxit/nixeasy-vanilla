#!/bin/bash
set -e

# NixEasy deployment script
# Usage: ./deploy.sh [user@host]
#
# First run on a fresh server:  ./deploy.sh user@server
# Subsequent deploys:           ./deploy.sh user@server
# Run directly on the server:   ./deploy.sh

REPO="https://github.com/myfoxit/nixeasy-vanilla.git"
APP_DIR="nixeasy-vanilla"
BACKUP_DIR="backups"

# ── Remote deploy (SSH) ─────────────────────────────────
if [ -n "$1" ]; then
  echo "🚀 Deploying to $1..."
  ssh "$1" 'bash -s' < "$0"
  exit $?
fi

# ── Local deploy (runs on the server) ───────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NixEasy Deploy — $(date '+%Y-%m-%d %H:%M:%S')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Install Docker if missing
if ! command -v docker &>/dev/null; then
  echo "📦 Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER"
  echo "⚠️  Docker installed. Log out and back in, then re-run this script."
  exit 1
fi

# Clone or pull
if [ ! -d "$APP_DIR" ]; then
  echo "📥 Cloning repository..."
  git clone "$REPO"
  cd "$APP_DIR"
else
  echo "📥 Pulling latest changes..."
  cd "$APP_DIR"
  git pull
fi

# Backup PocketBase data before deploy
if docker volume inspect "${APP_DIR}_pb_data" &>/dev/null 2>&1; then
  mkdir -p "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/pb_data_$(date '+%Y%m%d_%H%M%S').tar.gz"
  echo "💾 Backing up PocketBase data → $BACKUP_FILE"
  docker run --rm \
    -v "${APP_DIR}_pb_data:/data:ro" \
    -v "$(pwd)/$BACKUP_DIR:/backup" \
    alpine tar czf "/backup/$(basename $BACKUP_FILE)" -C /data .
  
  # Keep only last 5 backups
  ls -t "$BACKUP_DIR"/pb_data_*.tar.gz 2>/dev/null | tail -n +6 | xargs -r rm
  echo "   Kept last 5 backups"
fi

# Build and deploy
echo "🔨 Building and starting containers..."
docker compose up -d --build

# Wait for health
echo "⏳ Waiting for services..."
sleep 3

# Check status
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Deploy complete!"
echo "   App:        http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):8080"
echo "   PocketBase: http://$(hostname -I 2>/dev/null | awk '{print $1}' || echo 'localhost'):8090/_/"
