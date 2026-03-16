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

# ---------------------------------------------------------------------------
# Sync a collection (simple, no relation issues)
# ---------------------------------------------------------------------------
sync_collection() {
  local COLLECTION="$1"

  echo ""
  echo "📦 Syncing: ${COLLECTION}"

  RECORDS=$(curl -sf "${SOURCE}/api/collections/${COLLECTION}/records?perPage=500" \
    | jq '.items')
  COUNT=$(echo "$RECORDS" | jq 'length')
  echo "   Found ${COUNT} records on remote"

  [ "$COUNT" -eq 0 ] && { echo "   ⏭️  Nothing to sync"; return; }

  local SUCCESS=0 SKIPPED=0 FAILED=0

  for i in $(seq 0 $((COUNT - 1))); do
    RECORD=$(echo "$RECORDS" | jq ".[$i]")
    RECORD_ID=$(echo "$RECORD" | jq -r '.id')
    PAYLOAD=$(echo "$RECORD" | jq 'del(.collectionId, .collectionName, .expand)')

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      "${TARGET}/api/collections/${COLLECTION}/records" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${TOKEN}" \
      -d "$PAYLOAD")

    if [ "$HTTP_CODE" = "200" ]; then
      SUCCESS=$((SUCCESS + 1))
    elif [ "$HTTP_CODE" = "400" ]; then
      HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        "${TARGET}/api/collections/${COLLECTION}/records/${RECORD_ID}" \
        -X PATCH \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer ${TOKEN}" \
        -d "$PAYLOAD")
      [ "$HTTP_CODE" = "200" ] && SKIPPED=$((SKIPPED + 1)) || { FAILED=$((FAILED + 1)); echo "   ⚠️  Failed ${RECORD_ID} (HTTP ${HTTP_CODE})"; }
    else
      FAILED=$((FAILED + 1))
      echo "   ⚠️  Failed ${RECORD_ID} (HTTP ${HTTP_CODE})"
    fi
  done

  echo "   ✅ ${SUCCESS} created, 🔄 ${SKIPPED} updated, ❌ ${FAILED} failed"
}

# ---------------------------------------------------------------------------
# Sync licenses (two-pass: create without relations, then patch relations)
# ---------------------------------------------------------------------------
sync_licenses() {
  local COLLECTION="licenses"

  echo ""
  echo "📦 Syncing: ${COLLECTION} (two-pass for relations)"

  RECORDS=$(curl -sf "${SOURCE}/api/collections/${COLLECTION}/records?perPage=500" \
    | jq '.items')
  COUNT=$(echo "$RECORDS" | jq 'length')
  echo "   Found ${COUNT} records on remote"

  [ "$COUNT" -eq 0 ] && { echo "   ⏭️  Nothing to sync"; return; }

  # Pass 1: Create records without relation fields
  echo "   Pass 1: Creating records (without relations)..."
  local CREATED=0 EXISTS=0 FAIL1=0

  for i in $(seq 0 $((COUNT - 1))); do
    RECORD=$(echo "$RECORDS" | jq ".[$i]")
    RECORD_ID=$(echo "$RECORD" | jq -r '.id')

    # Strip relation fields + system fields
    PAYLOAD=$(echo "$RECORD" | jq 'del(.collectionId, .collectionName, .expand, .possible_SLAs, .depends_on)')

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      "${TARGET}/api/collections/${COLLECTION}/records" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${TOKEN}" \
      -d "$PAYLOAD")

    if [ "$HTTP_CODE" = "200" ]; then
      CREATED=$((CREATED + 1))
    elif [ "$HTTP_CODE" = "400" ]; then
      EXISTS=$((EXISTS + 1))
    else
      FAIL1=$((FAIL1 + 1))
      echo "   ⚠️  Pass 1 failed ${RECORD_ID} (HTTP ${HTTP_CODE})"
    fi
  done

  echo "   ✅ ${CREATED} created, ⏭️  ${EXISTS} exist, ❌ ${FAIL1} failed"

  # Pass 2: Patch relation fields onto existing records
  echo "   Pass 2: Patching relations..."
  local PATCHED=0 FAIL2=0

  for i in $(seq 0 $((COUNT - 1))); do
    RECORD=$(echo "$RECORDS" | jq ".[$i]")
    RECORD_ID=$(echo "$RECORD" | jq -r '.id')

    # Only send relation fields
    RELATIONS=$(echo "$RECORD" | jq '{possible_SLAs, depends_on}')

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      "${TARGET}/api/collections/${COLLECTION}/records/${RECORD_ID}" \
      -X PATCH \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${TOKEN}" \
      -d "$RELATIONS")

    if [ "$HTTP_CODE" = "200" ]; then
      PATCHED=$((PATCHED + 1))
    else
      FAIL2=$((FAIL2 + 1))
      echo "   ⚠️  Pass 2 failed ${RECORD_ID} (HTTP ${HTTP_CODE})"
    fi
  done

  echo "   ✅ ${PATCHED} patched, ❌ ${FAIL2} failed"
}

# ---------------------------------------------------------------------------
# Run in dependency order
# ---------------------------------------------------------------------------
sync_collection "service_level_agreements"
sync_collection "service_packs"
sync_licenses

echo ""
echo "🎉 Sync complete!"
