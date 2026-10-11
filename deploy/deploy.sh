#!/usr/bin/env bash
# Installs one release on the server. GitHub Actions uploads the release archive and runs this script from
# inside it, as tuxos-deploy:
#   bash deploy.sh <release-name>
# It moves the release into /opt/tuxos/releases, switches /opt/tuxos/current to it, restarts the API and
# checks it is healthy. If the check fails, it switches back to the previous release.
set -euo pipefail

release="${1:?usage: deploy.sh <release-name>}"
# The defaults are the server's; the overrides exist only to try the script locally.
root="${TUXOS_ROOT:-/opt/tuxos}"
restart="${TUXOS_RESTART:-sudo /usr/bin/systemctl restart tuxos-api}"
# The API listens on a Unix socket in production; locally a URL can be checked instead.
health_check() {
  if [[ -n "${TUXOS_HEALTH_URL:-}" ]]; then
    curl -fsS "$TUXOS_HEALTH_URL"
  else
    curl -fsS --unix-socket /run/tuxos/api.sock http://localhost/api/health
  fi
}
source_dir="$(cd "$(dirname "$0")/.." && pwd)"
target="$root/releases/$release"
keep=5

health() {
  for _ in $(seq 1 20); do
    if health_check >/dev/null 2>&1 && [[ -f "$root/current/web/index.html" ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

switch_to() {
  ln -sfn "$1" "$root/current.next"
  mv -Tf "$root/current.next" "$root/current"
  $restart
}

previous="$(readlink -f "$root/current" 2>/dev/null || true)"

rm -rf "$target"
mkdir -p "$target"
cp -a "$source_dir/web" "$source_dir/api" "$target/"
chmod -R a+rX "$target"

echo "Switching to $release"
switch_to "$target"
if health; then
  echo "Release $release is live."
else
  echo "Release $release failed its health check." >&2
  if [[ -n "$previous" && -d "$previous" && "$previous" != "$target" ]]; then
    echo "Rolling back to $(basename "$previous")" >&2
    switch_to "$previous"
    health || echo "The previous release is not healthy either; check: journalctl -u tuxos-api" >&2
  fi
  exit 1
fi

# Keep the newest few releases for quick rollbacks.
ls -1dt "$root"/releases/*/ | tail -n +$((keep + 1)) | xargs -r rm -rf
