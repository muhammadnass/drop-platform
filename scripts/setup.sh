#!/usr/bin/env bash
# ============================================================
# DROP LOGISTICS — Ubuntu Bootstrap Setup Script
# Usage: chmod +x setup.sh && ./setup.sh
# Tested on Ubuntu 22.04 LTS / 24.04 LTS
# ============================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────
ORANGE='\033[0;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

log()    { echo -e "${ORANGE}${BOLD}[DROP]${NC} $1"; }
success(){ echo -e "${GREEN}✓${NC} $1"; }
error()  { echo -e "${RED}✗${NC} $1"; exit 1; }

echo ""
echo -e "${ORANGE}${BOLD}"
echo "   ██████╗ ██████╗  ██████╗ ██████╗ "
echo "   ██╔══██╗██╔══██╗██╔═══██╗██╔══██╗"
echo "   ██║  ██║██████╔╝██║   ██║██████╔╝"
echo "   ██║  ██║██╔══██╗██║   ██║██╔═══╝ "
echo "   ██████╔╝██║  ██║╚██████╔╝██║     "
echo "   ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ ╚═╝     "
echo -e "${NC}"
echo "   Whatever you need, dropped in minutes."
echo "   Setup Script — Ubuntu"
echo ""

# ── 1. Check Ubuntu ──────────────────────────────────────────
if ! command -v apt-get &>/dev/null; then
  error "This script requires Ubuntu/Debian (apt-get not found)."
fi

# ── 2. System Packages ────────────────────────────────────────
log "Updating system packages…"
sudo apt-get update -qq
sudo apt-get install -y -qq curl git build-essential openssl

success "System packages ready"

# ── 3. Node.js 20 LTS via nvm ─────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v)" != v20* ]]; then
  log "Installing Node.js 20 LTS via nvm…"
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  # shellcheck source=/dev/null
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install 20
  nvm use 20
  nvm alias default 20
fi
success "Node $(node -v) / npm $(npm -v)"

# ── 4. pnpm (workspace tooling) ───────────────────────────────
if ! command -v pnpm &>/dev/null; then
  log "Installing pnpm…"
  npm install -g pnpm@latest
fi
success "pnpm $(pnpm -v)"

# ── 5. PostgreSQL 16 ──────────────────────────────────────────
if ! command -v psql &>/dev/null; then
  log "Installing PostgreSQL 16…"
  sudo apt-get install -y -qq postgresql postgresql-contrib
  sudo systemctl enable postgresql
  sudo systemctl start postgresql
fi
success "PostgreSQL $(psql --version | head -1)"

# ── 6. Create Database & User ─────────────────────────────────
log "Setting up PostgreSQL database…"
DB_NAME="drop_logistics"
DB_USER="drop_user"
DB_PASS="drop_dev_password"  # Change in production!

sudo -u postgres psql -tc "SELECT 1 FROM pg_user WHERE usename = '${DB_USER}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER ${DB_USER} WITH ENCRYPTED PASSWORD '${DB_PASS}';"

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};"

sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

success "Database '${DB_NAME}' ready (user: ${DB_USER})"

# ── 7. Project Directory Structure ────────────────────────────
log "Creating project directories…"

PROJECT_ROOT="$(pwd)"

dirs=(
  "apps/web/src/app/auth/login"
  "apps/web/src/app/dashboard/rider"
  "apps/web/src/app/dashboard/customer"
  "apps/web/src/app/dashboard/admin"
  "apps/web/src/app/dashboard/owner"
  "apps/web/src/app/api/auth"
  "apps/web/src/app/api/deliveries"
  "apps/web/src/app/api/fare"
  "apps/web/src/components/ui"
  "apps/web/src/components/rider"
  "apps/web/src/components/customer"
  "apps/web/src/components/admin"
  "apps/web/src/components/shared"
  "apps/web/src/lib"
  "apps/web/src/hooks"
  "apps/web/src/types"
  "apps/web/src/styles"
  "apps/web/public/icons"
  "server/src/gateways"
  "server/src/services"
  "server/src/routes"
  "server/src/middleware"
  "server/src/utils"
  "server/src/types"
  "prisma/migrations"
  "scripts"
)

for dir in "${dirs[@]}"; do
  mkdir -p "${PROJECT_ROOT}/${dir}"
done

success "Directory structure created"

# ── 8. Environment File ───────────────────────────────────────
if [ ! -f "${PROJECT_ROOT}/.env" ]; then
  log "Creating .env from .env.example…"
  cp "${PROJECT_ROOT}/.env.example" "${PROJECT_ROOT}/.env"

  # Auto-fill DB URL
  sed -i "s|postgresql://postgres:password@localhost:5432/drop_logistics|postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}|g" "${PROJECT_ROOT}/.env"

  # Generate JWT secret
  JWT_SECRET=$(openssl rand -hex 64)
  NEXTAUTH_SECRET=$(openssl rand -hex 32)
  sed -i "s|replace_with_a_long_random_secret_min_64_chars|${JWT_SECRET}|g" "${PROJECT_ROOT}/.env"
  sed -i "s|replace_with_another_long_random_secret|${NEXTAUTH_SECRET}|g" "${PROJECT_ROOT}/.env"

  success ".env created — remember to add your API keys!"
else
  success ".env already exists, skipping"
fi

# ── 9. Install Node Dependencies ──────────────────────────────
log "Installing npm dependencies (workspace root)…"
cd "${PROJECT_ROOT}"
npm install
success "Root dependencies installed"

log "Installing web app dependencies…"
cd "${PROJECT_ROOT}/apps/web"
npm install
success "Web app dependencies installed"

log "Installing server dependencies…"
cd "${PROJECT_ROOT}/server"
npm install
success "Server dependencies installed"

cd "${PROJECT_ROOT}"

# ── 10. Prisma Setup ──────────────────────────────────────────
log "Generating Prisma client…"
npm run db:generate

log "Running initial database migration…"
npm run db:migrate -- --name init

success "Database schema migrated"

# ── 11. VS Code Workspace File ────────────────────────────────
log "Creating VS Code workspace…"
cat > "${PROJECT_ROOT}/drop.code-workspace" << 'VSCODE'
{
  "folders": [
    { "name": "Root",   "path": "." },
    { "name": "Web",    "path": "./apps/web" },
    { "name": "Server", "path": "./server" }
  ],
  "settings": {
    "typescript.preferences.importModuleSpecifier": "relative",
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "tailwindCSS.experimental.classRegex": [
      ["clsx\\(([^)]*)\\)", "(?:'|\"|`)([^']*)(?:'|\"|`)"]
    ]
  },
  "extensions": {
    "recommendations": [
      "dbaeumer.vscode-eslint",
      "esbenp.prettier-vscode",
      "bradlc.vscode-tailwindcss",
      "prisma.prisma",
      "ms-azuretools.vscode-docker"
    ]
  }
}
VSCODE

success "VS Code workspace created: drop.code-workspace"

# ── 12. Git Init ──────────────────────────────────────────────
if [ ! -d "${PROJECT_ROOT}/.git" ]; then
  log "Initialising git repository…"
  git init
  cat > "${PROJECT_ROOT}/.gitignore" << 'GITIGNORE'
# Dependencies
node_modules/
.pnp
.pnp.js

# Build outputs
.next/
dist/
build/
out/

# Environment
.env
.env.local
.env.*.local

# Database
*.db
*.sqlite

# Prisma
prisma/migrations/dev/

# Logs
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# IDE
.idea/
*.suo
*.ntvs*
*.njsproj
*.sln

# Vercel
.vercel
GITIGNORE

  git add -A
  git commit -m "chore: initial Drop Logistics project scaffold"
  success "Git repository initialised"
fi

# ── Done ─────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}   Drop Logistics is ready to build! 🚀            ${NC}"
echo -e "${GREEN}${BOLD}═══════════════════════════════════════════════════${NC}"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Edit .env and add your API keys:"
echo "     • NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"
echo "     • STRIPE_SECRET_KEY + STRIPE_PRICE_ID"
echo ""
echo "  2. Start development servers:"
echo "     npm run dev"
echo ""
echo "  3. Open the app:"
echo "     http://localhost:3000"
echo ""
echo "  4. Open VS Code workspace:"
echo "     code drop.code-workspace"
echo ""
