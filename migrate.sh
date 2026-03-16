#!/bin/bash
set -e

# NixEasy data migration script
# Transfers PocketBase SQLite data between local and remote
#
# Usage:
#   ./migrate.sh push user@server    — Upload local data TO server
#   ./migrate.sh pull user@server    — Download server data TO local
#   ./migrate.sh backup              — Backup local PocketBase data
#   ./migrate.sh restore <file>      — Restore local from backup file

VOLUME_NAME="nixeasy-vanilla_pb_data"
BACKUP_DIR="backups"
TEMP_FILE="/tmp/pb_data_transfer_$(date +%s).tar.gz"

mkdir -p "$BACKUP_DIR"

# ── Helpers ──────────────────────────────────────────────

backup_volume() {
  local vol="$1"
  local output="$2"
  echo "💾 Backing up volume $vol..."
  docker run --rm \
    -v "${vol}:/data:ro" \
    -v "$(dirname $(realpath $output)):/backup" \
    alpine tar czf "/backup/$(basename $output)" -C /data .
  echo "   → $(du -h "$output" | cut -f1) saved to $output"
}

restore_volume() {
  local vol="$1"
  local input="$2"
  echo "📦 Restoring volume $vol from $input..."
  docker run --rm \
    -v "${vol}:/data" \
    -v "$(dirname $(realpath $input)):/backup" \
    alpine sh -c "rm -rf /data/* && tar xzf /backup/$(basename $input) -C /data"
  echo "   ✅ Restored"
}

# ── Commands ─────────────────────────────────────────────

case "${1:-help}" in

  push)
    # Push local PocketBase data to remote server
    SERVER="$2"
    if [ -z "$SERVER" ]; then
      echo "Usage: ./migrate.sh push user@server"
      exit 1
    fi

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Push local data → $SERVER"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Export local volume
    backup_volume "$VOLUME_NAME" "$TEMP_FILE"

    # Upload
    echo "📤 Uploading to $SERVER..."
    scp "$TEMP_FILE" "${SERVER}:/tmp/pb_data_transfer.tar.gz"

    # Restore on remote
    echo "📦 Restoring on server..."
    ssh "$SERVER" bash -s <<'EOF'
      cd nixeasy-vanilla 2>/dev/null || { echo "❌ nixeasy-vanilla not found. Run deploy.sh first."; exit 1; }
      
      # Backup existing remote data first
      REMOTE_VOL="nixeasy-vanilla_pb_data"
      if docker volume inspect "$REMOTE_VOL" &>/dev/null 2>&1; then
        echo "💾 Backing up existing server data..."
        mkdir -p backups
        docker run --rm \
          -v "${REMOTE_VOL}:/data:ro" \
          -v "$(pwd)/backups:/backup" \
          alpine tar czf "/backup/pb_data_pre_migrate_$(date +%Y%m%d_%H%M%S).tar.gz" -C /data .
      fi

      # Stop PocketBase
      docker compose stop pocketbase

      # Restore from upload
      docker run --rm \
        -v "${REMOTE_VOL}:/data" \
        -v /tmp:/backup \
        alpine sh -c "rm -rf /data/* && tar xzf /backup/pb_data_transfer.tar.gz -C /data"

      # Restart
      docker compose up -d
      rm /tmp/pb_data_transfer.tar.gz
      echo "✅ Server data restored and running"
EOF

    rm -f "$TEMP_FILE"
    echo ""
    echo "✅ Push complete! Server now has your local data."
    ;;

  pull)
    # Pull remote PocketBase data to local
    SERVER="$2"
    if [ -z "$SERVER" ]; then
      echo "Usage: ./migrate.sh pull user@server"
      exit 1
    fi

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Pull server data ← $SERVER"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Backup local first
    if docker volume inspect "$VOLUME_NAME" &>/dev/null 2>&1; then
      LOCAL_BACKUP="$BACKUP_DIR/pb_data_pre_pull_$(date +%Y%m%d_%H%M%S).tar.gz"
      backup_volume "$VOLUME_NAME" "$LOCAL_BACKUP"
    fi

    # Export on remote and download
    echo "📥 Downloading from $SERVER..."
    ssh "$SERVER" bash -s <<'EOF'
      cd nixeasy-vanilla 2>/dev/null || { echo "❌ nixeasy-vanilla not found."; exit 1; }
      REMOTE_VOL="nixeasy-vanilla_pb_data"
      docker run --rm \
        -v "${REMOTE_VOL}:/data:ro" \
        -v /tmp:/backup \
        alpine tar czf /backup/pb_data_transfer.tar.gz -C /data .
EOF
    scp "${SERVER}:/tmp/pb_data_transfer.tar.gz" "$TEMP_FILE"
    ssh "$SERVER" "rm -f /tmp/pb_data_transfer.tar.gz"

    # Stop local PocketBase and restore
    docker compose stop pocketbase
    restore_volume "$VOLUME_NAME" "$TEMP_FILE"
    docker compose up -d
    rm -f "$TEMP_FILE"

    echo ""
    echo "✅ Pull complete! Local now has server data."
    ;;

  backup)
    # Local backup
    BACKUP_FILE="$BACKUP_DIR/pb_data_$(date +%Y%m%d_%H%M%S).tar.gz"
    backup_volume "$VOLUME_NAME" "$BACKUP_FILE"
    echo "✅ Backup saved: $BACKUP_FILE"
    ;;

  restore)
    # Restore from backup file
    FILE="$2"
    if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
      echo "Usage: ./migrate.sh restore backups/pb_data_XXXX.tar.gz"
      echo ""
      echo "Available backups:"
      ls -lh "$BACKUP_DIR"/pb_data_*.tar.gz 2>/dev/null || echo "  (none)"
      exit 1
    fi

    echo "⚠️  This will overwrite your local PocketBase data!"
    read -p "Continue? [y/N] " confirm
    [ "$confirm" = "y" ] || exit 0

    docker compose stop pocketbase
    restore_volume "$VOLUME_NAME" "$FILE"
    docker compose up -d
    echo "✅ Restored from $FILE"
    ;;

  *)
    echo "NixEasy Data Migration"
    echo ""
    echo "Usage:"
    echo "  ./migrate.sh push user@server    Upload local data TO server"
    echo "  ./migrate.sh pull user@server    Download server data TO local"
    echo "  ./migrate.sh backup              Backup local PocketBase data"
    echo "  ./migrate.sh restore <file>      Restore from backup file"
    echo ""
    echo "Data is always backed up before overwriting."
    ;;
esac
