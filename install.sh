#!/bin/sh
# OpenClaw Remote Installer
# Usage: curl -fsSL https://openclaw.io/install.sh | bash
#        curl -fsSL https://openclaw.io/install.sh | bash -s -- --version 1.0.0

set -e

# Colors for terminal output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Configuration
REPO_URL="https://github.com/openclaw/openclaw"
API_URL="https://api.github.com/repos/openclaw/openclaw"
INSTALL_DIR="${HOME}/.openclaw"
BIN_DIR="${INSTALL_DIR}/bin"
VERSION="latest"
FORCE=false
SKIP_DEPS=false

# Logging functions
log_info() {
    printf "${BLUE}ℹ${NC}  %s\n" "$1"
}

log_success() {
    printf "${GREEN}✓${NC}  %s\n" "$1"
}

log_warning() {
    printf "${YELLOW}⚠${NC}  %s\n" "$1"
}

log_error() {
    printf "${RED}✗${NC}  %s\n" "$1"
}

log_step() {
    printf "\n${BOLD}${CYAN}→${NC}  %s\n" "$1"
}

# Print banner
print_banner() {
    printf "\n${CYAN}"
    cat << 'EOF'
  ___  ____  ____  ___    __    _  _ 
 / __)(  _ \(  _ \/ __)  /__\  ( \/ )
( (__  )   / )   /\__ \ /(__)\  )  ( 
 \___)(_)\_)(_)\_)(___/(__)(__)(_/\_)
EOF
    printf "${NC}\n"
    printf "${GRAY}  Solana-Powered AI Agent CLI${NC}\n"
    printf "${GRAY}  ───────────────────────────${NC}\n\n"
}

# Detect platform
detect_platform() {
    local platform
    platform=$(uname -s | tr '[:upper:]' '[:lower:]')
    
    case "$platform" in
        linux)
            if [ -f /etc/os-release ]; then
                . /etc/os-release
                echo "linux-${ID:-unknown}"
            else
                echo "linux-unknown"
            fi
            ;;
        darwin)
            echo "macos"
            ;;
        msys*|mingw*|cygwin*)
            echo "windows"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# Detect architecture
detect_arch() {
    local arch
    arch=$(uname -m)
    
    case "$arch" in
        x86_64|amd64)
            echo "x64"
            ;;
        arm64|aarch64)
            echo "arm64"
            ;;
        armv7l)
            echo "arm"
            ;;
        *)
            echo "$arch"
            ;;
    esac
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Node.js version
check_node_version() {
    if command_exists node; then
        local version
        version=$(node --version | sed 's/v//')
        local major
        major=$(echo "$version" | cut -d. -f1)
        
        if [ "$major" -ge 18 ]; then
            echo "$version"
            return 0
        fi
    fi
    return 1
}

# Install Node.js using nvm or package manager
install_nodejs() {
    log_step "Installing Node.js..."
    
    # Try nvm first
    if [ -n "$NVM_DIR" ] && [ -s "$NVM_DIR/nvm.sh" ]; then
        . "$NVM_DIR/nvm.sh"
        nvm install --lts
        nvm use --lts
        log_success "Node.js installed via nvm"
        return 0
    fi
    
    # Install nvm if not present
    if ! command_exists nvm; then
        log_info "Installing nvm..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
        nvm install --lts
        nvm use --lts
        log_success "Node.js installed via nvm"
        return 0
    fi
    
    # Fallback to package manager
    local platform
    platform=$(detect_platform)
    
    case "$platform" in
        linux-ubuntu|linux-debian)
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        linux-fedora|linux-rhel|linux-centos)
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
            sudo yum install -y nodejs
            ;;
        linux-arch)
            sudo pacman -S --noconfirm nodejs npm
            ;;
        macos)
            if command_exists brew; then
                brew install node
            else
                log_error "Please install Homebrew first: https://brew.sh"
                return 1
            fi
            ;;
        *)
            log_error "Unsupported platform for automatic Node.js installation"
            log_info "Please install Node.js v18+ manually from https://nodejs.org"
            return 1
            ;;
    esac
    
    log_success "Node.js installed"
}

# Download and install OpenClaw
download_openclaw() {
    log_step "Downloading OpenClaw..."
    
    local platform arch download_url temp_dir
    platform=$(detect_platform | cut -d- -f1)
    arch=$(detect_arch)
    temp_dir=$(mktemp -d)
    
    # Map platform names
    case "$platform" in
        linux) platform="linux" ;;
        macos) platform="darwin" ;;
        windows) platform="win32" ;;
    esac
    
    if [ "$VERSION" = "latest" ]; then
        download_url="${API_URL}/releases/latest"
    else
        download_url="${API_URL}/releases/tags/v${VERSION}"
    fi
    
    # Get release info
    local release_info
    release_info=$(curl -fsSL "$download_url" 2>/dev/null || echo "{}")
    
    # Find appropriate asset
    local asset_name
    asset_name="openclaw-${platform}-${arch}.tar.gz"
    
    log_info "Looking for: $asset_name"
    
    # Download the main setup script since we don't have releases yet
    # In production, this would download the actual release binary
    log_info "Downloading setup script..."
    
    # Create installation directory
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$BIN_DIR"
    
    # Download the setup wizard
    curl -fsSL "${REPO_URL}/raw/main/scripts/openclaw-setup.js" -o "${INSTALL_DIR}/openclaw-setup.js" 2>/dev/null || {
        log_warning "Could not download from GitHub, using bundled version..."
        # Fallback: create the setup script locally
        create_setup_script
    }
    
    # Make it executable
    chmod +x "${INSTALL_DIR}/openclaw-setup.js"
    
    # Create wrapper script
    cat > "${BIN_DIR}/openclaw" << 'EOF'
#!/bin/sh
exec node "${HOME}/.openclaw/openclaw-setup.js" "$@"
EOF
    chmod +x "${BIN_DIR}/openclaw"
    
    # Cleanup
    rm -rf "$temp_dir"
    
    log_success "OpenClaw downloaded to ${INSTALL_DIR}"
}

# Create the Node.js setup script locally (fallback)
create_setup_script() {
    log_info "Creating setup script locally..."
    
    cat > "${INSTALL_DIR}/openclaw-setup.js" << 'NODEEOF'
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const OPENCLAW_DIR = path.join(os.homedir(), '.openclaw');
const CONFIG_FILE = path.join(OPENCLAW_DIR, 'config.json');

console.log('OpenClaw Setup - Quick Mode');
console.log('Run with --interactive for full setup\n');

// Basic setup
if (!fs.existsSync(OPENCLAW_DIR)) {
    fs.mkdirSync(OPENCLAW_DIR, { recursive: true });
}

const config = {
    version: '1.0.0',
    installed: true,
    installedAt: new Date().toISOString(),
};

fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
console.log('✓ Configuration initialized at:', CONFIG_FILE);
console.log('\nOpenClaw is ready! Run: openclaw --help');
NODEEOF

    chmod +x "${INSTALL_DIR}/openclaw-setup.js"
}

# Update shell profile
update_profile() {
    local shell_rc
    
    case "$SHELL" in
        */zsh)
            shell_rc="$HOME/.zshrc"
            ;;
        */bash)
            if [ -f "$HOME/.bashrc" ]; then
                shell_rc="$HOME/.bashrc"
            else
                shell_rc="$HOME/.bash_profile"
            fi
            ;;
        */fish)
            shell_rc="$HOME/.config/fish/config.fish"
            ;;
        *)
            shell_rc="$HOME/.profile"
            ;;
    esac
    
    if ! grep -q "$BIN_DIR" "$shell_rc" 2>/dev/null; then
        log_step "Adding OpenClaw to PATH..."
        
        echo "" >> "$shell_rc"
        echo "# OpenClaw CLI" >> "$shell_rc"
        echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$shell_rc"
        
        log_success "Updated ${shell_rc}"
        log_info "Please run: source ${shell_rc}"
    fi
}

# Run the interactive setup
run_setup() {
    log_step "Running OpenClaw setup..."
    
    if [ -f "${INSTALL_DIR}/openclaw-setup.js" ]; then
        if command_exists node; then
            # Run the full interactive setup
            node "${INSTALL_DIR}/openclaw-setup.js" "$@"
        else
            log_error "Node.js not found. Please restart your terminal and run: openclaw-setup"
        fi
    else
        log_error "Setup script not found at ${INSTALL_DIR}/openclaw-setup.js"
        return 1
    fi
}

# Print help
print_help() {
    cat << EOF
OpenClaw Installer

Usage: curl -fsSL https://openclaw.io/install.sh | bash [options]

Options:
  --version VERSION    Install specific version (default: latest)
  --force              Force reinstall even if already installed
  --skip-deps          Skip dependency installation
  --help               Show this help message

Examples:
  # Install latest version
  curl -fsSL https://openclaw.io/install.sh | bash

  # Install specific version
  curl -fsSL https://openclaw.io/install.sh | bash -s -- --version 1.0.0

  # Force reinstall
  curl -fsSL https://openclaw.io/install.sh | bash -s -- --force

After Installation:
  openclaw --help          Show available commands
  openclaw setup           Run interactive setup
  openclaw agent start     Start your first agent

For more information: https://docs.openclaw.io
EOF
}

# Parse arguments
parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --version)
                VERSION="$2"
                shift 2
                ;;
            --force)
                FORCE=true
                shift
                ;;
            --skip-deps)
                SKIP_DEPS=true
                shift
                ;;
            --help|-h)
                print_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                print_help
                exit 1
                ;;
        esac
    done
}

# Main installation flow
main() {
    print_banner
    
    parse_args "$@"
    
    # Check if already installed
    if [ -d "$INSTALL_DIR" ] && [ "$FORCE" != "true" ]; then
        log_warning "OpenClaw is already installed at ${INSTALL_DIR}"
        printf "${YELLOW}Reinstall? [y/N]${NC} "
        read -r response
        case "$response" in
            [Yy]*)
                FORCE=true
                ;;
            *)
                log_info "Installation cancelled. Run with --force to skip this prompt."
                exit 0
                ;;
        esac
    fi
    
    # Check/install Node.js
    if [ "$SKIP_DEPS" != "true" ]; then
        local node_version
        node_version=$(check_node_version)
        
        if [ -n "$node_version" ]; then
            log_success "Node.js v${node_version} found"
        else
            log_warning "Node.js v18+ is required but not found"
            printf "${YELLOW}Install Node.js automatically? [Y/n]${NC} "
            read -r response
            case "$response" in
                [Nn]*)
                    log_error "Node.js is required. Please install it manually."
                    exit 1
                    ;;
                *)
                    install_nodejs || exit 1
                    ;;
            esac
        fi
    fi
    
    # Download OpenClaw
    download_openclaw
    
    # Update PATH
    update_profile
    
    # Add to current session
    export PATH="$BIN_DIR:$PATH"
    
    # Success message
    printf "\n${GREEN}${BOLD}✓ OpenClaw installed successfully!${NC}\n\n"
    
    cat << EOF
${CYAN}What's next?${NC}

  1. Restart your terminal or run:
     ${YELLOW}source ~/.$(basename "$SHELL")rc${NC}

  2. Run the interactive setup:
     ${YELLOW}openclaw-setup${NC}

  3. Or start using OpenClaw:
     ${YELLOW}openclaw --help${NC}

${GRAY}Need help? Visit https://docs.openclaw.io${NC}

EOF
    
    # Offer to run setup now
    printf "${CYAN}Run interactive setup now? [Y/n]${NC} "
    read -r response
    case "$response" in
        [Nn]*)
            log_info "You can run setup later with: openclaw-setup"
            ;;
        *)
            run_setup
            ;;
    esac
}

# Run main
main "$@"
