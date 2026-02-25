#!/usr/bin/env bash
# setup-local.sh — one-command local environment setup for Electragram
# Checks prerequisites, generates configuration, and starts all services.
# One-command local setup.
# Run it once after cloning — it
#  checks Docker/Node/pnpm/openssl are installed,
#  copies .env.example → .env.local,
#  generates a 2048-bit RSA JWT key pair stored as keys/jwt-private.pem and keys/jwt-public.pem,
#  writes JWT_PRIVATE_KEY_FILE / JWT_PUBLIC_KEY_FILE paths into .env.local,
#  generates a 64-hex-char encryption key and writes it into .env.local,
#  installs Node dependencies,
#  runs docker compose up -d --wait,
#  and prints the full port reference table.
# Safe to re-run — it skips steps that are already done.

set -euo pipefail

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[info]${NC}  $*"; }
success() { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
error()   { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║        Electragram — local setup tool         ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# ─── 1. Prerequisites ─────────────────────────────────────────────────────────
info "Checking prerequisites..."

# Docker
if ! command -v docker &>/dev/null; then
  error "Docker is not installed. Download it from https://www.docker.com/products/docker-desktop"
fi
if ! docker info &>/dev/null; then
  error "Docker is installed but not running. Please start Docker Desktop and try again."
fi
success "Docker is running"

# Docker Compose (plugin style)
if ! docker compose version &>/dev/null; then
  error "Docker Compose (v2) is required. It is included with Docker Desktop 4.x+."
fi
success "Docker Compose is available"

# Node.js 22+
if ! command -v node &>/dev/null; then
  error "Node.js 22 or later is required. Install from https://nodejs.org"
fi
NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [[ "$NODE_MAJOR" -lt 22 ]]; then
  error "Node.js 22+ required (you have $(node --version)). Install the latest from https://nodejs.org"
fi
success "Node.js $(node --version) found"

# pnpm
if ! command -v pnpm &>/dev/null; then
  warn "pnpm not found — installing via npm..."
  npm install -g pnpm@latest
fi
success "pnpm $(pnpm --version) found"

# openssl (for JWT key generation)
if ! command -v openssl &>/dev/null; then
  error "openssl is required but not found. On macOS: brew install openssl"
fi
success "openssl found"

echo ""

# ─── 2. .env.local ────────────────────────────────────────────────────────────
info "Setting up environment configuration..."

if [[ -f ".env.local" ]]; then
  warn ".env.local already exists — skipping copy from .env.example"
  warn "Delete .env.local and re-run this script to regenerate from scratch."
else
  if [[ ! -f ".env.example" ]]; then
    error ".env.example not found. Make sure you are running this from the repo root."
  fi
  cp .env.example .env.local
  success "Created .env.local from .env.example"
fi

# ─── 3. JWT key pair ──────────────────────────────────────────────────────────
info "Checking JWT keys..."

KEYS_DIR="$REPO_ROOT/keys"
PRIVATE_KEY_FILE="$KEYS_DIR/jwt-private.pem"
PUBLIC_KEY_FILE="$KEYS_DIR/jwt-public.pem"

if [[ -f "$PRIVATE_KEY_FILE" ]] && [[ -f "$PUBLIC_KEY_FILE" ]]; then
  success "JWT key files already exist — skipping generation"
else
  info "Generating RSA-2048 JWT key pair..."

  mkdir -p "$KEYS_DIR"
  chmod 700 "$KEYS_DIR"

  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
    -out "$PRIVATE_KEY_FILE" 2>/dev/null
  openssl rsa -pubout -in "$PRIVATE_KEY_FILE" \
    -out "$PUBLIC_KEY_FILE" 2>/dev/null

  chmod 600 "$PRIVATE_KEY_FILE"
  chmod 644 "$PUBLIC_KEY_FILE"

  success "JWT key pair written to keys/jwt-private.pem and keys/jwt-public.pem"
fi

# Write file path references into .env.local
info "Updating JWT key file paths in .env.local..."
python3 - "$PRIVATE_KEY_FILE" "$PUBLIC_KEY_FILE" <<'PYEOF'
import sys, re, pathlib

priv_path = sys.argv[1]
pub_path  = sys.argv[2]

env_path = pathlib.Path(".env.local")
text = env_path.read_text()

# Replace or append JWT_PRIVATE_KEY_FILE
if re.search(r"^JWT_PRIVATE_KEY_FILE=", text, re.MULTILINE):
    text = re.sub(r"^JWT_PRIVATE_KEY_FILE=.*$", f"JWT_PRIVATE_KEY_FILE={priv_path}", text, flags=re.MULTILINE)
else:
    text = re.sub(r"^JWT_PRIVATE_KEY=.*$", f"JWT_PRIVATE_KEY_FILE={priv_path}", text, flags=re.MULTILINE)
    if "JWT_PRIVATE_KEY_FILE" not in text:
        text += f"\nJWT_PRIVATE_KEY_FILE={priv_path}\n"

# Replace or append JWT_PUBLIC_KEY_FILE
if re.search(r"^JWT_PUBLIC_KEY_FILE=", text, re.MULTILINE):
    text = re.sub(r"^JWT_PUBLIC_KEY_FILE=.*$", f"JWT_PUBLIC_KEY_FILE={pub_path}", text, flags=re.MULTILINE)
else:
    text = re.sub(r"^JWT_PUBLIC_KEY=.*$", f"JWT_PUBLIC_KEY_FILE={pub_path}", text, flags=re.MULTILINE)
    if "JWT_PUBLIC_KEY_FILE" not in text:
        text += f"\nJWT_PUBLIC_KEY_FILE={pub_path}\n"

env_path.write_text(text)
PYEOF
success "JWT key file paths written to .env.local"

# ─── 4. ENCRYPTION_KEY (Integrations service) ─────────────────────────────────
info "Checking ENCRYPTION_KEY in .env.local..."

if grep -q "^ENCRYPTION_KEY=[0-9a-f]\{64\}" .env.local 2>/dev/null; then
  success "ENCRYPTION_KEY already set — skipping"
else
  ENC_KEY=$(openssl rand -hex 32)
  if grep -q "^ENCRYPTION_KEY=" .env.local; then
    python3 - "$ENC_KEY" <<'PYEOF'
import sys, re, pathlib
key  = sys.argv[1]
path = pathlib.Path(".env.local")
text = path.read_text()
text = re.sub(r"^ENCRYPTION_KEY=.*$", f"ENCRYPTION_KEY={key}", text, flags=re.MULTILINE)
path.write_text(text)
PYEOF
  else
    printf "\nENCRYPTION_KEY=%s\n" "$ENC_KEY" >> .env.local
  fi
  success "ENCRYPTION_KEY generated and written to .env.local"
fi

echo ""

# ─── 5. Install Node dependencies ─────────────────────────────────────────────
info "Installing Node.js dependencies (this may take a minute the first time)..."
pnpm install --frozen-lockfile 2>&1 | tail -5
success "Dependencies installed"

echo ""

# ─── 6. Start all services ────────────────────────────────────────────────────
info "Starting all services with Docker Compose..."
info "(First run will download Docker images — could take 5–10 minutes)"
echo ""

docker compose up -d --wait --build

echo ""
success "All services are up and healthy!"
echo ""

# ─── 7. Port reference ────────────────────────────────────────────────────────
echo -e "${CYAN}┌──────────────────────────────────────────────────┐${NC}"
echo -e "${CYAN}│             Service port reference               │${NC}"
echo -e "${CYAN}├──────────────────────┬───────────────────────────┤${NC}"
printf "${CYAN}│${NC} %-20s ${CYAN}│${NC} %-25s ${CYAN}│${NC}\n" "Service"       "URL"
echo -e "${CYAN}├──────────────────────┼───────────────────────────┤${NC}"
printf "${CYAN}│${NC} %-20s ${CYAN}│${NC} %-25s ${CYAN}│${NC}\n" "Web app"        "http://localhost:3000"
printf "${CYAN}│${NC} %-20s ${CYAN}│${NC} %-25s ${CYAN}│${NC}\n" "Identity API"   "http://localhost:3001"
printf "${CYAN}│${NC} %-20s ${CYAN}│${NC} %-25s ${CYAN}│${NC}\n" "Contacts API"   "http://localhost:3002"
printf "${CYAN}│${NC} %-20s ${CYAN}│${NC} %-25s ${CYAN}│${NC}\n" "Events API"     "http://localhost:3003"
printf "${CYAN}│${NC} %-20s ${CYAN}│${NC} %-25s ${CYAN}│${NC}\n" "Messaging API"  "http://localhost:3004"
printf "${CYAN}│${NC} %-20s ${CYAN}│${NC} %-25s ${CYAN}│${NC}\n" "Chat API"       "http://localhost:3007"
printf "${CYAN}│${NC} %-20s ${CYAN}│${NC} %-25s ${CYAN}│${NC}\n" "Integrations"   "http://localhost:3008"
printf "${CYAN}│${NC} %-20s ${CYAN}│${NC} %-25s ${CYAN}│${NC}\n" "Design API"     "http://localhost:3009"
printf "${CYAN}│${NC} %-20s ${CYAN}│${NC} %-25s ${CYAN}│${NC}\n" "Analytics API"  "http://localhost:3010"
printf "${CYAN}│${NC} %-20s ${CYAN}│${NC} %-25s ${CYAN}│${NC}\n" "PostgreSQL"     "localhost:5432"
printf "${CYAN}│${NC} %-20s ${CYAN}│${NC} %-25s ${CYAN}│${NC}\n" "Redis"          "localhost:6379"
printf "${CYAN}│${NC} %-20s ${CYAN}│${NC} %-25s ${CYAN}│${NC}\n" "LocalStack AWS" "http://localhost:4566"
echo -e "${CYAN}└──────────────────────┴───────────────────────────┘${NC}"

echo ""
echo -e "${GREEN}✓ Everything is running.${NC}"
echo ""
echo "  Next step: create your first account"
echo ""
echo -e "  ${YELLOW}bash scripts/create-first-user.sh${NC}"
echo ""
echo "  Or open the web app: http://localhost:3000 and sign up there."
echo ""
echo "  To stop all services:    docker compose down"
echo "  To wipe all data:        docker compose down -v"
echo ""
