#!/bin/sh
set -u

ROOT="${1:-.}"
FAIL_COUNT=0

required_paths="
index.html
styles.css
app.js
setup-admin.html
setup-admin.js
admin.html
admin.css
admin.js
deployment-check.html
deployment-check.js
build-info.json
package.json
CURRENT_LIVE_STATUS.md
netlify.toml
netlify/functions/create-booking.js
netlify/functions/setup-admin-user.js
netlify/functions/admin-login.js
netlify/functions/deploy-marker.js
netlify/functions/public-config.js
netlify/functions/send-test-notification.js
supabase/schema.sql
assets/icon.svg
scripts/check-live-deploy.sh
"

printf "Checking source root: %s\n\n" "$ROOT"

for path in $required_paths; do
  if [ -e "$ROOT/$path" ]; then
    printf "PASS  %s\n" "$path"
  else
    printf "FAIL  %s\n" "$path"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

if [ -d "$ROOT/legendary-auto-spa-app" ]; then
  printf "\nWARN  Found nested legendary-auto-spa-app/ folder. Do not use it as the GitHub repo root unless it contains the current files.\n"
fi

printf "\n%s missing required path%s\n" "$FAIL_COUNT" "$(if [ "$FAIL_COUNT" = "1" ]; then printf ""; else printf "s"; fi)"

if [ "$FAIL_COUNT" -gt 0 ]; then
  printf "\nFix the source root before pushing to GitHub or deploying to Netlify.\n"
  exit 1
fi

printf "\nSource root has the required live app, admin, backend, and deploy-check files.\n"
