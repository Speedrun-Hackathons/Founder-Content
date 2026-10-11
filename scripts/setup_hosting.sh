#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE=".env"
touch "$ENV_FILE"

put() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
  fi
}

open_url() {
  if command -v start >/dev/null 2>&1; then start "" "$1"; elif command -v open >/dev/null 2>&1; then open "$1"; else xdg-open "$1"; fi
}

if ! grep -q "^AUTH_SECRET=." "$ENV_FILE"; then
  put AUTH_SECRET "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
  echo "AUTH_SECRET written to $ENV_FILE"
fi

echo "Step 1 of 3: Railway project"
echo "  New project, Deploy from GitHub repo, pick Speedrun-Hackathons/Founder-Content."
echo "  Settings, Networking, Generate Domain. Copy the https URL."
open_url "https://railway.com/new"
read -r -p "Railway URL (https://...): " RAILWAY_URL
RAILWAY_URL="${RAILWAY_URL%/}"
put AUTH_URL "$RAILWAY_URL"

echo "Step 2 of 3: Google OAuth client"
echo "  APIs and Services, Credentials, Create credentials, OAuth client ID, Web application."
echo "  Authorized redirect URIs:"
echo "    ${RAILWAY_URL}/api/auth/callback/google"
echo "    http://localhost:3000/api/auth/callback/google"
open_url "https://console.cloud.google.com/apis/credentials"
read -r -p "Client ID: " GOOGLE_ID
read -r -s -p "Client secret: " GOOGLE_SECRET
echo
put AUTH_GOOGLE_ID "$GOOGLE_ID"
put AUTH_GOOGLE_SECRET "$GOOGLE_SECRET"

echo "Step 3 of 3: Railway variables"
echo "  In the Railway service, Variables tab, add these (values from $ENV_FILE):"
for key in AUTH_SECRET AUTH_URL AUTH_GOOGLE_ID AUTH_GOOGLE_SECRET OPENAI_API_KEY KEEWANO_API_KEY SOCIAL_STREAMLINE_API_KEY SOCIAL_STREAMLINE_MCP_URL; do
  echo "    $key"
done
echo "  Then redeploy and check ${RAILWAY_URL}/api/health answers {\"ok\":true}."
curl -sS -m 20 "${RAILWAY_URL}/api/health" || echo "health check did not answer yet"
echo
