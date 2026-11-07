#!/bin/sh
# Nocap Cloud installer.
#
#   curl -fsSL https://get.nocapcloud.com | sh
#   curl -fsSL https://get.nocapcloud.com | sh -s -- --version v0.1.0
#
# Options:
#   --version <tag>   Install a specific release instead of the latest
#   --uninstall       Stop and remove the stack, keep the data
#   --purge           With --uninstall, also delete the data and /opt/nocapcloud
#   --yes             Do not ask for confirmation
#
# Running it again on an installed server repairs the setup and keeps your data and secrets.

set -eu

REPO="LGYx2/nocap-cloud"
INSTALL_DIR="${NOCAP_DIR:-/opt/nocapcloud}"
HEALTH_URL="http://127.0.0.1:3000/api/health"

VERSION=""
UNINSTALL=0
PURGE=0
ASSUME_YES=0

if [ -t 1 ]; then
  BOLD="$(printf '\033[1m')"; BLUE="$(printf '\033[38;5;63m')"; RED="$(printf '\033[31m')"
  YELLOW="$(printf '\033[33m')"; RESET="$(printf '\033[0m')"
else
  BOLD=""; BLUE=""; RED=""; YELLOW=""; RESET=""
fi

info() { printf '%s==>%s %s\n' "$BLUE" "$RESET" "$1"; }
warn() { printf '%swarning:%s %s\n' "$YELLOW" "$RESET" "$1" >&2; }
fatal() { printf '%serror:%s %s\n' "$RED" "$RESET" "$1" >&2; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --version) [ $# -ge 2 ] || fatal "--version needs a value, for example v0.1.0"; VERSION="$2"; shift 2 ;;
    --uninstall) UNINSTALL=1; shift ;;
    --purge) PURGE=1; shift ;;
    --yes|-y) ASSUME_YES=1; shift ;;
    -h|--help)
      cat <<'EOF'
Nocap Cloud installer

  --version <tag>   Install a specific release instead of the latest
  --uninstall       Stop and remove the stack, keep the data
  --purge           With --uninstall, also delete the data and /opt/nocapcloud
  --yes             Do not ask for confirmation
EOF
      exit 0 ;;
    *) fatal "Unknown option: $1" ;;
  esac
done

confirm() {
  [ "$ASSUME_YES" -eq 1 ] && return 0
  [ -r /dev/tty ] || fatal "Run with --yes to confirm without a terminal"
  printf '%s [y/N] ' "$1"
  read -r answer < /dev/tty
  case "$answer" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

[ "$(id -u)" -eq 0 ] || fatal "Run as root, for example: curl -fsSL https://get.nocapcloud.com | sudo sh"

compose() { docker compose --project-directory "$INSTALL_DIR" "$@"; }

# ---------------------------------------------------------------- uninstall
if [ "$UNINSTALL" -eq 1 ]; then
  [ -f "$INSTALL_DIR/docker-compose.yml" ] || fatal "Nocap Cloud is not installed in $INSTALL_DIR"
  if [ "$PURGE" -eq 1 ]; then
    confirm "This deletes the database, certificates and $INSTALL_DIR. Continue?" || exit 1
    compose down --volumes
    rm -rf "$INSTALL_DIR"
    info "Nocap Cloud and its data are removed."
  else
    compose down
    info "Nocap Cloud is stopped and removed. Data volumes are kept."
  fi
  exit 0
fi

# ---------------------------------------------------------------- checks
info "Checking the server"

[ -r /etc/os-release ] || fatal "Cannot read /etc/os-release"
# shellcheck disable=SC1091
. /etc/os-release
if [ "${ID:-}" != "ubuntu" ] || { [ "${VERSION_ID:-}" != "22.04" ] && [ "${VERSION_ID:-}" != "24.04" ]; }; then
  if [ "${NOCAP_SKIP_OS_CHECK:-0}" = "1" ]; then
    warn "Unsupported system (${PRETTY_NAME:-unknown}), continuing because NOCAP_SKIP_OS_CHECK=1"
  else
    fatal "Nocap Cloud supports Ubuntu 22.04 and 24.04. Found ${PRETTY_NAME:-unknown}."
  fi
fi

case "$(uname -m)" in
  x86_64|amd64) ;;
  aarch64|arm64) ;;
  *) fatal "Unsupported CPU architecture: $(uname -m). Use amd64 or arm64." ;;
esac

mem_kb=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
if [ "$mem_kb" -lt 900000 ]; then
  fatal "At least 1 GB of RAM is needed. Found $((mem_kb / 1024)) MB."
elif [ "$mem_kb" -lt 1900000 ]; then
  warn "Found $((mem_kb / 1024)) MB of RAM. 2 GB is recommended, because builds need memory."
fi

disk_kb=$(df -Pk / | awk 'NR == 2 {print $4}')
if [ "$disk_kb" -lt 10000000 ]; then
  fatal "At least 10 GB of free disk is needed (20 GB recommended). Found $((disk_kb / 1048576)) GB."
elif [ "$disk_kb" -lt 20000000 ]; then
  warn "Found $((disk_kb / 1048576)) GB of free disk. 20 GB is recommended."
fi

existing=0
[ -f "$INSTALL_DIR/.env" ] && existing=1

if [ "$existing" -eq 0 ] && command -v ss >/dev/null 2>&1; then
  for port in 80 443 3000; do
    if ss -ltnH "sport = :$port" | grep -q .; then
      fatal "Port $port is already in use. Stop the program using it and run the installer again."
    fi
  done
fi

command -v curl >/dev/null 2>&1 || fatal "curl is required"

# ---------------------------------------------------------------- docker
if ! command -v docker >/dev/null 2>&1; then
  info "Installing Docker"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || fatal "The Docker Compose plugin is missing. Install docker-compose-plugin."
systemctl enable --now docker >/dev/null 2>&1 || true

# ---------------------------------------------------------------- version
if [ -z "$VERSION" ]; then
  if [ "$existing" -eq 1 ]; then
    VERSION=$(sed -n 's/^NOCAP_VERSION=//p' "$INSTALL_DIR/.env")
  else
    VERSION=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
      | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)
  fi
fi
[ -n "$VERSION" ] || fatal "Could not find the latest release. Try again with --version."
info "Installing Nocap Cloud $VERSION"

# ---------------------------------------------------------------- files
mkdir -p "$INSTALL_DIR"
chmod 700 "$INSTALL_DIR"

compose_url="https://github.com/$REPO/releases/download/$VERSION/docker-compose.yml"
curl -fsSL "$compose_url" -o "$INSTALL_DIR/docker-compose.yml.tmp" \
  || fatal "Could not download $compose_url"
mv "$INSTALL_DIR/docker-compose.yml.tmp" "$INSTALL_DIR/docker-compose.yml"

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    od -An -tx1 -N"$1" /dev/urandom | tr -d ' \n'
  fi
}

if [ "$existing" -eq 0 ]; then
  info "Generating secrets"
  umask 077
  cat > "$INSTALL_DIR/.env" <<EOF
# Nocap Cloud settings. Keep this file private: it holds the database password and the master key.
NOCAP_VERSION=$VERSION
POSTGRES_PASSWORD=$(random_hex 24)
NOCAP_SECRET=$(random_hex 32)
EOF
else
  # Keep the existing secrets; only update the version.
  sed -i "s/^NOCAP_VERSION=.*/NOCAP_VERSION=$VERSION/" "$INSTALL_DIR/.env"
fi
chmod 600 "$INSTALL_DIR/.env"

# ---------------------------------------------------------------- start
info "Downloading images"
compose pull --quiet
info "Starting Nocap Cloud"
compose up -d --remove-orphans

info "Waiting for the panel to start"
tries=0
until curl -fsS "$HEALTH_URL" >/dev/null 2>&1; do
  tries=$((tries + 1))
  if [ "$tries" -gt 60 ]; then
    fatal "The panel did not start in 2 minutes. Check the logs with: docker logs nocap"
  fi
  sleep 2
done

ip=$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')

printf '\n%sNocap Cloud %s is running.%s\n\n' "$BOLD" "$VERSION" "$RESET"
printf '  Open %shttp://%s:3000%s to create your admin account.\n' "$BOLD" "$ip" "$RESET"
printf '  Files: %s\n\n' "$INSTALL_DIR"
