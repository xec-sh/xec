#!/bin/bash

# Docker SSH Test Container Manager
# This script manages Docker containers for SSH testing across different Linux distributions

# Configuration
# Script is in packages/testing/, docker images are in packages/testing/docker/
DOCKER_DIR="${DOCKER_DIR:-$(dirname "$0")/docker}"
DOCKER_CMD="${DOCKER_CMD:-/usr/local/bin/docker}"

# Container configurations - using separate arrays for compatibility
CONTAINER_NAMES=(
    "ubuntu-apt"
    "centos7-yum"
    "fedora-dnf"
    "alpine-apk"
    "manjaro-pacman"
    "ubuntu-brew"
    "ubuntu-snap"
)

CONTAINER_PORTS=(
    "2201"
    "2202"
    "2203"
    "2204"
    "2205"
    "2206"
    "2207"
)

# Function to get port by container name
get_container_port() {
    local container_name=$1
    local i
    for i in "${!CONTAINER_NAMES[@]}"; do
        if [[ "${CONTAINER_NAMES[$i]}" == "$container_name" ]]; then
            echo "${CONTAINER_PORTS[$i]}"
            return 0
        fi
    done
    return 1
}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check if Docker is available
check_docker() {
    if ! command -v "$DOCKER_CMD" &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        return 1
    fi
    
    if ! "$DOCKER_CMD" info &> /dev/null; then
        log_error "Docker daemon is not running"
        return 1
    fi
    
    return 0
}

# Check if a container is running
is_container_running() {
    local container_name=$1
    "$DOCKER_CMD" ps --format '{{.Names}}' | grep -q "^${container_name}$"
}

# Start a specific container
start_container() {
    local container_name=$1
    local port=$(get_container_port "$container_name")
    
    if [ -z "$port" ]; then
        log_error "Unknown container: $container_name"
        return 1
    fi
    
    if is_container_running "$container_name"; then
        log_info "Container $container_name is already running"
        return 0
    fi
    
    log_info "Starting container $container_name on port $port..."
    
    # Navigate to the container's directory
    local container_dir="$DOCKER_DIR/$container_name"
    if [ ! -d "$container_dir" ]; then
        log_error "Container directory not found: $container_dir"
        return 1
    fi
    
    # Start the container using docker-compose
    (cd "$container_dir" && "$DOCKER_CMD" compose up -d)
    
    if [ $? -eq 0 ]; then
        log_info "Container $container_name started successfully"
        return 0
    else
        log_error "Failed to start container $container_name"
        return 1
    fi
}

# Stop a specific container
stop_container() {
    local container_name=$1
    local port=$(get_container_port "$container_name")
    
    if [ -z "$port" ]; then
        log_error "Unknown container: $container_name"
        return 1
    fi
    
    if ! is_container_running "$container_name"; then
        log_info "Container $container_name is not running"
        return 0
    fi
    
    log_info "Stopping container $container_name..."
    
    # Navigate to the container's directory
    local container_dir="$DOCKER_DIR/$container_name"
    if [ ! -d "$container_dir" ]; then
        log_error "Container directory not found: $container_dir"
        return 1
    fi
    
    # Stop the container using docker-compose
    (cd "$container_dir" && "$DOCKER_CMD" compose down)
    
    if [ $? -eq 0 ]; then
        log_info "Container $container_name stopped successfully"
        return 0
    else
        log_error "Failed to stop container $container_name"
        return 1
    fi
}

# Start all containers
start_all() {
    log_info "Starting all SSH test containers..."
    
    local failed=0
    for container_name in "${CONTAINER_NAMES[@]}"; do
        if ! start_container "$container_name"; then
            failed=$((failed + 1))
        fi
    done
    
    if [ $failed -eq 0 ]; then
        log_info "All containers started successfully"
        return 0
    else
        log_warning "$failed container(s) failed to start"
        return 1
    fi
}

# Stop all containers
stop_all() {
    log_info "Stopping all SSH test containers..."
    
    local failed=0
    for container_name in "${CONTAINER_NAMES[@]}"; do
        if ! stop_container "$container_name"; then
            failed=$((failed + 1))
        fi
    done
    
    if [ $failed -eq 0 ]; then
        log_info "All containers stopped successfully"
        return 0
    else
        log_warning "$failed container(s) failed to stop"
        return 1
    fi
}

# Show status of all containers
show_status() {
    log_info "SSH Test Container Status:"
    echo "----------------------------------------"
    printf "%-20s %-10s %-10s\n" "CONTAINER" "PORT" "STATUS"
    echo "----------------------------------------"
    
    local i
    for i in "${!CONTAINER_NAMES[@]}"; do
        local container_name="${CONTAINER_NAMES[$i]}"
        local port="${CONTAINER_PORTS[$i]}"
        local status="Stopped"
        
        if is_container_running "$container_name"; then
            status="Running"
        fi
        
        printf "%-20s %-10s %-10s\n" "$container_name" "$port" "$status"
    done
    echo "----------------------------------------"
}

# Clean up all containers and volumes
clean_all() {
    log_info "Cleaning up all SSH test containers and volumes..."
    
    stop_all
    
    # Remove volumes
    for container_name in "${CONTAINER_NAMES[@]}"; do
        local container_dir="$DOCKER_DIR/$container_name"
        if [ -d "$container_dir" ]; then
            log_info "Removing volumes for $container_name..."
            (cd "$container_dir" && "$DOCKER_CMD" compose down -v)
        fi
    done
    
    log_info "Cleanup completed"
}

# Main script logic
main() {
    # Check if Docker is available
    if ! check_docker; then
        exit 1
    fi
    
    # Parse command
    case "${1:-help}" in
        start)
            if [ -n "$2" ]; then
                start_container "$2"
            else
                start_all
            fi
            ;;
        stop)
            if [ -n "$2" ]; then
                stop_container "$2"
            else
                stop_all
            fi
            ;;
        status)
            show_status
            ;;
        clean)
            clean_all
            ;;
        help|--help|-h)
            echo "Docker SSH Test Container Manager"
            echo ""
            echo "Usage: $0 [command] [container_name]"
            echo ""
            echo "Commands:"
            echo "  start [container]  - Start all containers or a specific container"
            echo "  stop [container]   - Stop all containers or a specific container"
            echo "  status            - Show status of all containers"
            echo "  clean             - Stop and remove all containers and volumes"
            echo "  help              - Show this help message"
            echo ""
            echo "Available containers:"
            local i
            for i in "${!CONTAINER_NAMES[@]}"; do
                echo "  - ${CONTAINER_NAMES[$i]} (port ${CONTAINER_PORTS[$i]})"
            done
            ;;
        *)
            log_error "Unknown command: $1"
            echo "Run '$0 help' for usage information"
            exit 1
            ;;
    esac
}

# Run main function
main "$@"