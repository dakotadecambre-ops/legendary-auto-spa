#!/bin/sh
set -u

SITE_URL="${1:-https://legendaryautospa.netlify.app}"
SITE_URL="${SITE_URL%/}"

PASS_COUNT=0
FAIL_COUNT=0

check_url() {
  label="$1"
  path="$2"
  expected="$3"
  url="${SITE_URL}${path}"

  body_file="$(mktemp)"
  status="$(curl -L -sS -o "$body_file" -w "%{http_code}" "$url" 2>/dev/null || printf "000")"

  if [ "$expected" = "json" ]; then
    if [ "$status" = "200" ] && grep -q "live-backend-admin-setup" "$body_file"; then
      printf "PASS  %s  %s\n" "$label" "$url"
      PASS_COUNT=$((PASS_COUNT + 1))
    else
      printf "FAIL  %s  %s  HTTP %s\n" "$label" "$url" "$status"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  elif [ "$expected" = "function" ]; then
    if [ "$status" != "404" ] && ! grep -qi "Page not found" "$body_file"; then
      printf "PASS  %s  %s  HTTP %s\n" "$label" "$url" "$status"
      PASS_COUNT=$((PASS_COUNT + 1))
    else
      printf "FAIL  %s  %s  HTTP %s\n" "$label" "$url" "$status"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  else
    if [ "$status" = "200" ] && ! grep -qi "Page not found" "$body_file"; then
      printf "PASS  %s  %s\n" "$label" "$url"
      PASS_COUNT=$((PASS_COUNT + 1))
    else
      printf "FAIL  %s  %s  HTTP %s\n" "$label" "$url" "$status"
      FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
  fi

  rm -f "$body_file"
}

printf "Checking Legendary Auto Spa deploy: %s\n\n" "$SITE_URL"

check_url "Build marker" "/build-info.json?fresh=$(date +%s)" "json"
check_url "Deployment check page" "/deployment-check?fresh=$(date +%s)" "page"
check_url "Setup script" "/setup-admin.js?fresh=$(date +%s)" "page"
check_url "Admin script" "/admin.js?fresh=$(date +%s)" "page"
check_url "Backend deploy marker" "/.netlify/functions/deploy-marker" "json"
check_url "Public config function" "/.netlify/functions/public-config" "function"
check_url "Setup admin function" "/.netlify/functions/setup-admin-user" "function"
check_url "Booking function" "/.netlify/functions/create-booking" "function"
check_url "Admin login function" "/.netlify/functions/admin-login" "function"
check_url "Test notification function" "/.netlify/functions/send-test-notification" "function"

printf "\n%s passed, %s failed\n" "$PASS_COUNT" "$FAIL_COUNT"

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf "\nIf build-info.json fails, Netlify is deploying the wrong repo root or old files.\n"
  printf "If build-info.json passes but functions fail, netlify.toml or netlify/functions is missing from the deployed repo root.\n"
  exit 1
fi

printf "\nDeploy shape looks correct. Continue with /setup-admin and /admin.\n"
