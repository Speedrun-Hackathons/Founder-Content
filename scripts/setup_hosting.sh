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

if ! grep -q "^AUTH_SECRET=." "$ENV_FILE"; then
  put AUTH_SECRET "$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
  echo "AUTH_SECRET written to $ENV_FILE"
fi

echo "Step 1 of 3: the sign-in account"
read -r -p "Demo email: " DEMO_EMAIL
read -r -s -p "Demo password: " DEMO_PASSWORD
echo
put DEMO_EMAIL "$DEMO_EMAIL"
put DEMO_PASSWORD "$DEMO_PASSWORD"
put AUTH_URL "http://localhost:3000"

echo "Step 2 of 3: the Railway URL"
echo "  Railway: New Project, Deploy from GitHub repo, Settings, Networking, Generate Domain."
read -r -p "Railway URL (https://..., empty to skip): " RAILWAY_URL
RAILWAY_URL="${RAILWAY_URL%/}"

echo "Step 3 of 3: Railway variables"
echo "  In the Railway service, Variables tab, add these with the values from $ENV_FILE, and AUTH_URL set to the Railway URL:"
for key in AUTH_SECRET AUTH_URL DEMO_EMAIL DEMO_PASSWORD OPENAI_API_KEY KEEWANO_API_KEY SOCIAL_STREAMLINE_API_KEY SOCIAL_STREAMLINE_MCP_URL; do
  echo "    $key"
done
if [ -n "$RAILWAY_URL" ]; then
  echo "  Checking ${RAILWAY_URL}/api/health"
  curl -sS -m 20 "${RAILWAY_URL}/api/health" || echo "health check did not answer yet"
  echo
fi
