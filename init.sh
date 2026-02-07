#!/bin/bash

# init.sh - Annotatr Development Environment Setup
# This script sets up and runs the Annotatr development environment

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Annotatr Development Environment Setup${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js is not installed${NC}"
    echo "  Please install Node.js from https://nodejs.org/"
    exit 1
fi
echo -e "${GREEN}✓${NC} Node.js $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} npm $(npm --version)"

# Check Rust
if ! command -v rustc &> /dev/null; then
    echo -e "${RED}✗ Rust is not installed${NC}"
    echo "  Please install Rust from https://rustup.rs/"
    exit 1
fi
echo -e "${GREEN}✓${NC} rustc $(rustc --version)"

# Check Cargo
if ! command -v cargo &> /dev/null; then
    echo -e "${RED}✗ Cargo is not installed${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} cargo $(cargo --version)"

# Check Tauri CLI
if ! cargo tauri --version &> /dev/null; then
    echo -e "${YELLOW}! Tauri CLI not found, installing...${NC}"
    cargo install tauri-cli
fi
echo -e "${GREEN}✓${NC} $(cargo tauri --version)"

echo ""
echo -e "${YELLOW}Installing dependencies...${NC}"

# Install Node dependencies if package.json exists
if [ -f "package.json" ]; then
    echo "Installing npm packages..."
    npm install
    echo -e "${GREEN}✓${NC} npm packages installed"
else
    echo -e "${YELLOW}! package.json not found, skipping npm install${NC}"
fi

echo ""
echo -e "${YELLOW}Starting development server...${NC}"
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}  Development server starting...${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "The application will open automatically."
echo -e "Mini panel will appear for tool selection."
echo -e "Use ${YELLOW}Ctrl+Shift+D${NC} to toggle drawing mode."
echo ""
echo -e "${BLUE}Commands:${NC}"
echo -e "  - ${GREEN}npm run tauri dev${NC}  : Start development server"
echo -e "  - ${GREEN}npm run tauri build${NC} : Build for production"
echo ""
echo -e "${BLUE}Hotkeys (default):${NC}"
echo -e "  - Ctrl+Shift+A : Arrow tool"
echo -e "  - Ctrl+Shift+C : Circle tool"
echo -e "  - Ctrl+Shift+B : Box tool"
echo -e "  - Ctrl+Shift+F : Freehand tool"
echo -e "  - Ctrl+Shift+H : Highlighter tool"
echo -e "  - Ctrl+Shift+T : Text tool"
echo -e "  - Ctrl+Shift+D : Toggle drawing mode"
echo -e "  - Escape       : Cancel drawing"
echo ""
echo -e "${BLUE}========================================${NC}"
echo ""

# Start the development server
npm run tauri dev
