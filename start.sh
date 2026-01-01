#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Neo4j Agent Memory - Complete Solution Startup           ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo ""

# Check if .env exists
if [ ! -f "apps/demo-api/.env" ]; then
    echo -e "${RED}❌ Error: apps/demo-api/.env not found${NC}"
    echo -e "${YELLOW}Please copy apps/demo-api/.env.example to apps/demo-api/.env and configure it${NC}"
    exit 1
fi

# Step 1: Start Neo4j
echo -e "${BLUE}[1/6]${NC} Starting Neo4j database..."
docker compose up -d
echo -e "${GREEN}✓ Neo4j started${NC}"
echo ""

# Wait for Neo4j to be ready
echo -e "${BLUE}[2/6]${NC} Waiting for Neo4j to be ready..."
sleep 5
echo -e "${GREEN}✓ Neo4j ready${NC}"
echo ""

# Step 2: Install dependencies
echo -e "${BLUE}[3/6]${NC} Installing dependencies..."
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 3: Build packages
echo -e "${BLUE}[4/6]${NC} Building packages..."
npm run build
echo -e "${GREEN}✓ Packages built${NC}"
echo ""

# Step 4: Seed database
echo -e "${BLUE}[5/6]${NC} Seeding Neo4j database..."
npm run db:seed
echo -e "${GREEN}✓ Database seeded${NC}"
echo ""

# Step 5: Show database status
echo -e "${BLUE}[6/6]${NC} Checking database status..."
npm run db:check
echo ""

# Final instructions
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  ✓ Setup Complete!                                        ║${NC}"
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo -e "  ${BLUE}1.${NC} Start the API server:"
echo -e "     ${GREEN}npm run dev${NC}"
echo -e "     API will be available at: ${BLUE}http://localhost:3000${NC}"
echo ""
echo -e "  ${BLUE}2.${NC} Start the UI (in a new terminal):"
echo -e "     ${GREEN}npm run dev:ui${NC}"
echo -e "     UI will be available at: ${BLUE}http://localhost:5173${NC}"
echo ""
echo -e "  ${BLUE}3.${NC} Or start both together:"
echo -e "     ${GREEN}npm run start:all${NC}"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo -e "  ${GREEN}npm run db:check${NC}    - Check database contents"
echo -e "  ${GREEN}npm run db:stop${NC}     - Stop Neo4j"
echo -e "  ${GREEN}npm run db:start${NC}    - Start Neo4j"
echo ""
echo -e "${YELLOW}Access points:${NC}"
echo -e "  API:          ${BLUE}http://localhost:3000${NC}"
echo -e "  UI:           ${BLUE}http://localhost:5173${NC}"
echo -e "  Neo4j Browser: ${BLUE}http://localhost:7474${NC}"
echo -e "  Neo4j Bolt:    ${BLUE}neo4j://localhost:7687${NC}"
echo ""

