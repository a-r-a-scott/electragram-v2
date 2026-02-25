#!/usr/bin/env bash
# create-first-user.sh — create the first user account in Electragram
# Interactive curl script.
#  Prompts for first name, last name, email, organisation name, and password;
#  POSTs to POST /api/auth/signup;
#  prints the returned access token.
#  Accepts --api-url or the ELECTRAGRAM_API_URL env var for targeting a remote (AWS) deployment.
#
# Usage:
#   bash scripts/create-first-user.sh                   # interactive prompts
#   bash scripts/create-first-user.sh --api-url <url>   # target a remote API (e.g. AWS)
#
# The script calls POST /api/auth/signup and prints the returned access token.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[info]${NC}  $*"; }
success() { echo -e "${GREEN}[ok]${NC}    $*"; }
error()   { echo -e "${RED}[error]${NC} $*" >&2; exit 1; }

# ─── Defaults ─────────────────────────────────────────────────────────────────
API_URL="${ELECTRAGRAM_API_URL:-http://localhost:3001}"

# ─── Argument parsing ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --api-url)  API_URL="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: bash scripts/create-first-user.sh [--api-url <url>]"
      echo ""
      echo "  --api-url   Base URL of the Identity service (default: http://localhost:3001)"
      echo "              Set the ELECTRAGRAM_API_URL env var as an alternative."
      exit 0
      ;;
    *) error "Unknown argument: $1" ;;
  esac
done

# ─── Check dependencies ───────────────────────────────────────────────────────
if ! command -v curl &>/dev/null; then
  error "curl is required but not found. Install it via your system package manager."
fi

# python3 or jq for pretty-printing the response
HAS_JQ=false; HAS_PY=false
command -v jq      &>/dev/null && HAS_JQ=true
command -v python3 &>/dev/null && HAS_PY=true

# ─── Header ───────────────────────────────────────────────────────────────────
echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║     Electragram — create your first account   ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""
echo "  API: $API_URL"
echo ""

# ─── Check the API is reachable ───────────────────────────────────────────────
info "Checking that the Identity service is reachable..."
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$API_URL/health" || true)
if [[ "$HTTP_STATUS" != "200" ]]; then
  echo ""
  error "Could not reach $API_URL/health (got HTTP $HTTP_STATUS).
  Make sure the services are running:
    bash scripts/setup-local.sh     (local)
    or check your API_URL for AWS deployment"
fi
success "Identity service is reachable"
echo ""

# ─── Collect user input ───────────────────────────────────────────────────────
echo "Please provide details for your administrator account."
echo "(Press Enter to accept any default shown in [brackets])"
echo ""

read_input() {
  local prompt="$1"
  local default="${2:-}"
  local value=""
  if [[ -n "$default" ]]; then
    read -rp "  $prompt [$default]: " value
    echo "${value:-$default}"
  else
    while [[ -z "$value" ]]; do
      read -rp "  $prompt: " value
      if [[ -z "$value" ]]; then
        echo -e "  ${RED}This field is required.${NC}" >&2
      fi
    done
    echo "$value"
  fi
}

read_password() {
  local value=""
  while [[ ${#value} -lt 8 ]]; do
    read -rsp "  Password (min 8 characters): " value
    echo ""
    if [[ ${#value} -lt 8 ]]; then
      echo -e "  ${RED}Password must be at least 8 characters.${NC}" >&2
    fi
  done
  echo "$value"
}

FIRST_NAME=$(read_input   "First name")
LAST_NAME=$(read_input    "Last name")
EMAIL=$(read_input        "Email address")
ACCOUNT_NAME=$(read_input "Organisation / account name" "${FIRST_NAME}'s Workspace")
PASSWORD=$(read_password)

echo ""
info "Creating account..."

# ─── Build and send the request ───────────────────────────────────────────────
# Escape any special characters in values for JSON
json_escape() {
  python3 -c "import json,sys; print(json.dumps(sys.argv[1])[1:-1])" "$1" 2>/dev/null \
    || printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

PAYLOAD=$(printf '{"email":"%s","password":"%s","firstName":"%s","lastName":"%s","accountName":"%s"}' \
  "$(json_escape "$EMAIL")" \
  "$(json_escape "$PASSWORD")" \
  "$(json_escape "$FIRST_NAME")" \
  "$(json_escape "$LAST_NAME")" \
  "$(json_escape "$ACCOUNT_NAME")")

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$API_URL/api/auth/signup" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

# ─── Handle the response ──────────────────────────────────────────────────────
if [[ "$HTTP_CODE" == "201" ]] || [[ "$HTTP_CODE" == "200" ]]; then
  success "Account created! (HTTP $HTTP_CODE)"
  echo ""

  # Extract the access token
  ACCESS_TOKEN=""
  if $HAS_JQ; then
    ACCESS_TOKEN=$(echo "$BODY" | jq -r '.accessToken // .data.accessToken // empty' 2>/dev/null || true)
  elif $HAS_PY; then
    ACCESS_TOKEN=$(python3 -c "
import sys, json
try:
    d = json.loads(sys.argv[1])
    t = d.get('accessToken') or (d.get('data') or {}).get('accessToken') or ''
    print(t)
except Exception:
    pass
" "$BODY" 2>/dev/null || true)
  fi

  echo -e "${CYAN}┌──────────────────────────────────────────────────┐${NC}"
  echo -e "${CYAN}│               Account created                    │${NC}"
  echo -e "${CYAN}├──────────────────────────────────────────────────┤${NC}"
  printf  "${CYAN}│${NC}  Email:    %-37s ${CYAN}│${NC}\n" "$EMAIL"
  printf  "${CYAN}│${NC}  Account:  %-37s ${CYAN}│${NC}\n" "$ACCOUNT_NAME"
  echo -e "${CYAN}└──────────────────────────────────────────────────┘${NC}"
  echo ""

  if [[ -n "$ACCESS_TOKEN" ]]; then
    echo -e "  ${GREEN}Access token (save this — it expires in 1 hour):${NC}"
    echo ""
    echo "  $ACCESS_TOKEN"
    echo ""
    echo "  Use this token in the Authorization header:"
    echo -e "  ${YELLOW}Authorization: Bearer <token>${NC}"
    echo ""
  fi

  echo "  You can now log in at http://localhost:3000 (local)"
  echo "  or at your API Gateway URL (AWS) using these credentials."
  echo ""

else
  echo ""
  echo -e "${RED}Signup failed (HTTP $HTTP_CODE)${NC}"
  echo ""
  if $HAS_JQ; then
    echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
  elif $HAS_PY; then
    python3 -c "import sys,json; print(json.dumps(json.loads(sys.argv[1]), indent=2))" "$BODY" 2>/dev/null || echo "$BODY"
  else
    echo "$BODY"
  fi
  echo ""

  if echo "$BODY" | grep -qi "already exists\|duplicate\|conflict"; then
    echo -e "${YELLOW}Tip:${NC} An account with that email may already exist."
    echo "     Try logging in at http://localhost:3000 instead."
  fi

  exit 1
fi
