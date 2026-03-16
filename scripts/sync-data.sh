#!/usr/bin/env bash
set -euo pipefail

# Sync licenses, service_level_agreements, and service_packs
# from remote PocketBase to local Docker PocketBase.
#
# Usage:
#   ./scripts/sync-data.sh <local-superuser-email> <local-superuser-password>
#
# Prerequisites: curl, jq

SOURCE="https://base.heli0s.dev"
TARGET="http://localhost:8090"

COLLECTIONS=("licenses" "service_level_agreements" "service_packs")

if [ $# -lt 2 ]; then
  echo "Usage: $0 <superuser-email> <superuser-password>"
  echo "  Credentials are for the LOCAL PocketBase superuser."
  exit 1
fi

LOCAL_EMAIL="$1"
LOCAL_PASS="$2"

# Check dependencies
for cmd in curl jq; do
  command -v "$cmd" >/dev/null || { echo "❌ $cmd is required"; exit 1; }
done

# Authenticate with local PocketBase (superuser)
echo "🔑 Authenticating with local PocketBase..."
AUTH_RESPONSE=$(curl -sf "${TARGET}/api/admins/auth-with-password" \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"${LOCAL_EMAIL}\",\"password\":\"${LOCAL_PASS}\"}" 2>/dev/null || true)

# Try v0.23+ superusers endpoint if admin endpoint fails
if [ -z "$AUTH_RESPONSE" ] || ! echo "$AUTH_RESPONSE" | jq -e '.token' >/dev/null 2>&1; then
  AUTH_RESPONSE=$(curl -sf "${TARGET}/api/collections/_superusers/auth-with-password" \
    -H "Content-Type: application/json" \
    -d "{\"identity\":\"${LOCAL_EMAIL}\",\"password\":\"${LOCAL_PASS}\"}")
fi

TOKEN=$(echo "$AUTH_RESPONSE" | jq -r '.token')

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
  echo "❌ Failed to authenticate. Check your credentials."
  exit 1
fi

echo "✅ Authenticated"

for COLLECTION in "${COLLECTIONS[@]}"; do
  echo ""
  echo "📦 Syncing: ${COLLECTION}"

  # Fetch all records from source (public, no auth needed)
  RECORDS=$(curl -sf "${SOURCE}/api/collections/${COLLECTION}/records?perPage=500" \
    | jq '.items')

  COUNT=$(echo "$RECORDS" | jq 'length')
  echo "   Found ${COUNT} records on remote"

  if [ "$COUNT" -eq 0 ]; then
    echo "   ⏭️  Nothing to sync"
    continue
  fi

  SUCCESS=0
  SKIPPED=0
  FAILED=0

  # Insert each record into target
  for i in $(seq 0 $((COUNT - 1))); do
    RECORD=$(echo "$RECORDS" | jq ".[$i]")
    RECORD_ID=$(echo "$RECORD" | jq -r '.id')

    # Strip system fields that PB manages (created/updated are kept for data fidelity)
    PAYLOAD=$(echo "$RECORD" | jq 'del(.collectionId, .collectionName)')

    # Try to create with the same ID
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      "${TARGET}/api/collections/${COLLECTION}/records" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${TOKEN}" \
      -d "$PAYLOAD")

    if [ "$HTTP_CODE" = "200" ]; then
      SUCCESS=$((SUCCESS + 1))
    elif [ "$HTTP_CODE" = "400" ]; then
      # Likely already exists — try update
      HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        "${TARGET}/api/collections/${COLLECTION}/records/${RECORD_ID}" \
        -X PATCH \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${TOKEN}" \
        -d "$PAYLOAD")
      if [ "$HTTP_CODE" = "200" ]; then
        SKIPPED=$((SKIPPED + 1))
      else
        FAILED=$((FAILED + 1))
        echo "   ⚠️  Failed to upsert ${RECORD_ID} (HTTP ${HTTP_CODE})"
      fi
    else
      FAILED=$((FAILED + 1))
      echo "   ⚠️  Failed to create ${RECORD_ID} (HTTP ${HTTP_CODE})"
    fi
  done

  echo "   ✅ ${SUCCESS} created, 🔄 ${SKIPPED} updated, ❌ ${FAILED} failed"
done

echo ""
echo "🎉 Sync complete!"
