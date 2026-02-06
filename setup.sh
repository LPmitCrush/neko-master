#!/bin/bash

# Clash Master One-Click Setup Script
# Automatically detects port conflicts and provides solutions

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default ports
DEFAULT_WEB_PORT=3000
DEFAULT_API_PORT=3001
DEFAULT_WS_PORT=3002

# Current ports (will be modified)
WEB_PORT=$DEFAULT_WEB_PORT
API_PORT=$DEFAULT_API_PORT
WS_PORT=$DEFAULT_WS_PORT

# Print colored messages
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Check if port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port in use
    else
        return 1  # Port available
    fi
}

# Find available port
find_available_port() {
    local start_port=$1
    local port=$start_port
    
    while check_port $port; do
        port=$((port + 1))
    done
    
    echo $port
}

# Show welcome message
show_welcome() {
    echo ""
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║          Clash Master - One-Click Setup                ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo ""
    print_info "This script will help you quickly configure Clash Master"
    echo ""
}

# Check port conflicts and ask user
check_ports() {
    print_info "Checking if default ports are available..."
    echo ""
    
    local conflict_found=false
    local suggested_web=$DEFAULT_WEB_PORT
    local suggested_api=$DEFAULT_API_PORT
    local suggested_ws=$DEFAULT_WS_PORT
    
    # Check each port
    if check_port $DEFAULT_WEB_PORT; then
        suggested_web=$(find_available_port $DEFAULT_WEB_PORT)
        print_warning "Port $DEFAULT_WEB_PORT (Web UI) is already in use"
        print_info "  Suggested alternative: $suggested_web"
        conflict_found=true
    fi
    
    if check_port $DEFAULT_API_PORT; then
        suggested_api=$(find_available_port $DEFAULT_API_PORT)
        print_warning "Port $DEFAULT_API_PORT (API) is already in use"
        print_info "  Suggested alternative: $suggested_api"
        conflict_found=true
    fi
    
    if check_port $DEFAULT_WS_PORT; then
        suggested_ws=$(find_available_port $DEFAULT_WS_PORT)
        print_warning "Port $DEFAULT_WS_PORT (WebSocket) is already in use"
        print_info "  Suggested alternative: $suggested_ws"
        conflict_found=true
    fi
    
    echo ""
    
    if [ "$conflict_found" = true ]; then
        print_warning "Port conflicts detected!"
        echo ""
        echo "Please choose an option:"
        echo "  1) Use suggested ports ($suggested_web/$suggested_api/$suggested_ws)"
        echo "  2) Enter custom ports manually"
        echo "  3) Exit and configure manually later"
        echo ""
        read -p "Enter your choice [1-3]: " choice
        
        case $choice in
            1)
                WEB_PORT=$suggested_web
                API_PORT=$suggested_api
                WS_PORT=$suggested_ws
                print_success "Using suggested ports"
                ;;
            2)
                echo ""
                read -p "Web UI port [$suggested_web]: " input_web
                read -p "API port [$suggested_api]: " input_api
                read -p "WebSocket port [$suggested_ws]: " input_ws
                WEB_PORT=${input_web:-$suggested_web}
                API_PORT=${input_api:-$suggested_api}
                WS_PORT=${input_ws:-$suggested_ws}
                ;;
            3)
                echo ""
                print_info "You can manually configure later using one of these methods:"
                echo "  1. Copy .env.example to .env and modify ports"
                echo "  2. Edit docker-compose.yml directly"
                echo ""
                exit 0
                ;;
            *)
                print_error "Invalid option"
                exit 1
                ;;
        esac
    else
        print_success "All default ports are available"
    fi
    
    echo ""
}

# Create .env file
create_env_file() {
    print_info "Creating configuration file..."
    
    cat > .env << EOF
# =============================================================================
# Clash Master Environment Configuration
# =============================================================================
# Generated at: $(date)

# -----------------------------------------------------------------------------
# Port Configuration (Change these if ports are already in use)
# -----------------------------------------------------------------------------
# These ports will be exposed on your host machine

# Web UI access port (default: 3000)
# Access the dashboard at http://your-host:WEB_EXTERNAL_PORT
WEB_EXTERNAL_PORT=$WEB_PORT

# API port (default: 3001)
API_EXTERNAL_PORT=$API_PORT

# WebSocket port (default: 3002)
WS_EXTERNAL_PORT=$WS_PORT

# -----------------------------------------------------------------------------
# Advanced Configuration (Usually don't need to change)
# -----------------------------------------------------------------------------
# Internal ports used inside the container
# WEB_PORT=3000
# API_PORT=3001
# COLLECTOR_WS_PORT=3002

# Database path inside container
# DB_PATH=/app/data/stats.db

# Node environment
# NODE_ENV=production

# =============================================================================
# After configuration, start the service with:
#   docker compose up -d
#
# Then access: http://localhost:$WEB_PORT
# =============================================================================
EOF
    
    print_success "Configuration file created: .env"
    echo ""
}

# Create data directory
create_data_dir() {
    if [ ! -d "./data" ]; then
        mkdir -p ./data
        print_success "Data directory created: ./data"
    fi
}

# Show configuration summary
show_summary() {
    echo ""
    echo "╔════════════════════════════════════════════════════════╗"
    echo "║              Configuration Summary                      ║"
    echo "╚════════════════════════════════════════════════════════╝"
    echo ""
    echo "  Web UI Port:     $WEB_PORT"
    echo "  API Port:        $API_PORT"
    echo "  WebSocket Port:  $WS_PORT"
    echo ""
    echo "  Access URL:"
    echo "    http://localhost:$WEB_PORT"
    echo ""
    echo "  Config file: .env"
    echo ""
}

# Ask if user wants to start service
ask_start() {
    read -p "Start the service now? [Y/n]: " start_now
    start_now=${start_now:-Y}
    
    if [[ $start_now =~ ^[Yy]$ ]]; then
        echo ""
        print_info "Starting Clash Master..."
        echo ""
        
        if command -v docker-compose &> /dev/null; then
            docker-compose up -d
        else
            docker compose up -d
        fi
        
        echo ""
        print_success "Service started!"
        echo ""
        echo "  Please wait 10-20 seconds for services to fully initialize"
        echo "  Then access: http://localhost:$WEB_PORT"
        echo ""
        echo "  Common commands:"
        echo "    View logs:  docker logs -f clash-master"
        echo "    Stop:       docker compose down"
        echo "    Restart:    docker compose restart"
        echo ""
    else
        echo ""
        print_info "Configuration complete. Start later with:"
        echo "  docker compose up -d"
        echo ""
    fi
}

# Main function
main() {
    show_welcome
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        echo ""
        echo "Please install Docker first:"
        echo "  https://docs.docker.com/get-docker/"
        echo ""
        exit 1
    fi
    
    # Check docker-compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed"
        echo ""
        exit 1
    fi
    
    # Check if .env already exists
    if [ -f ".env" ]; then
        print_warning "Existing .env file detected"
        read -p "Reconfigure? [y/N]: " reconfig
        if [[ ! $reconfig =~ ^[Yy]$ ]]; then
            print_info "Using existing configuration"
            show_summary
            ask_start
            exit 0
        fi
    fi
    
    # Check ports
    check_ports
    
    # Create configuration
    create_env_file
    create_data_dir
    
    # Show summary
    show_summary
    
    # Ask to start
    ask_start
}

# Run main function
main
