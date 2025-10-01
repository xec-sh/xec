#!/bin/bash
# Script to run package manager tests with Docker containers

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# Path to docker-ssh-manager.sh in @xec-sh/testing package (from monorepo root)
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../../../.." && pwd)"
DOCKER_MANAGER="$MONOREPO_ROOT/packages/testing/docker-ssh-manager.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Package Manager Integration Tests${NC}"
echo "=================================="

# Function to check prerequisites
check_prerequisites() {
    echo -e "${YELLOW}Checking prerequisites...${NC}"
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Error: Docker is not installed${NC}"
        exit 1
    fi
    
    # Check if Docker daemon is running
    if ! docker ps &> /dev/null; then
        echo -e "${RED}Error: Docker daemon is not running${NC}"
        exit 1
    fi
    
    # Check sshpass
    if ! command -v sshpass &> /dev/null; then
        echo -e "${YELLOW}Warning: sshpass is not installed. Container readiness checks may fail.${NC}"
        echo "Install with: brew install hudochenkov/sshpass/sshpass (macOS) or apt install sshpass (Linux)"
    fi
    
    echo -e "${GREEN}Prerequisites check passed${NC}"
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [options] [test-pattern]

Options:
  -s, --start-only     Only start containers, don't run tests
  -k, --keep-running   Keep containers running after tests
  -c, --containers     Comma-separated list of containers to use
  -t, --timeout        Timeout for operations (default: 120s)
  -h, --help           Show this help message

Examples:
  $0                           # Run all package manager tests
  $0 "apt"                     # Run only apt-related tests
  $0 -c ubuntu-apt,alpine-apk  # Test only specific containers
  $0 -k                        # Keep containers running after tests

Available containers:
  ubuntu-apt     - Ubuntu with apt package manager
  centos7-yum    - CentOS 7 with yum package manager
  fedora-dnf     - Fedora with dnf package manager
  alpine-apk     - Alpine with apk package manager
  manjaro-pacman - Manjaro with pacman package manager
  ubuntu-brew    - Ubuntu with Homebrew
  ubuntu-snap    - Ubuntu with Snap packages
EOF
}

# Parse command line arguments
START_ONLY=false
KEEP_RUNNING=false
CONTAINERS=""
TIMEOUT=120
TEST_PATTERN=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--start-only)
            START_ONLY=true
            shift
            ;;
        -k|--keep-running)
            KEEP_RUNNING=true
            shift
            ;;
        -c|--containers)
            CONTAINERS="$2"
            shift 2
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            TEST_PATTERN="$1"
            shift
            ;;
    esac
done

# Check prerequisites
check_prerequisites

# Start containers
echo -e "\n${YELLOW}Starting Docker containers...${NC}"
cd "$PROJECT_DIR"

if [ -n "$CONTAINERS" ]; then
    # Start specific containers
    IFS=',' read -ra CONTAINER_ARRAY <<< "$CONTAINERS"
    for container in "${CONTAINER_ARRAY[@]}"; do
        echo -e "${YELLOW}Starting ${container}...${NC}"
        "$DOCKER_MANAGER" start "$container"
    done
else
    # Start all containers
    "$DOCKER_MANAGER" start
fi

# Check container status
echo -e "\n${YELLOW}Container Status:${NC}"
"$DOCKER_MANAGER" status

if [ "$START_ONLY" = true ]; then
    echo -e "\n${GREEN}Containers started. Exiting without running tests.${NC}"
    exit 0
fi

# Run tests
echo -e "\n${YELLOW}Running package manager tests...${NC}"

# Set timeout for Jest
export JEST_TIMEOUT=$((TIMEOUT * 1000))

# Build test command
TEST_CMD="yarn test test/integration/package-managers.test.ts"

if [ -n "$TEST_PATTERN" ]; then
    TEST_CMD="$TEST_CMD -t \"$TEST_PATTERN\""
fi

# Run the tests
echo -e "${YELLOW}Executing: $TEST_CMD${NC}"
eval $TEST_CMD
TEST_EXIT_CODE=$?

# Cleanup
if [ "$KEEP_RUNNING" = false ]; then
    echo -e "\n${YELLOW}Stopping Docker containers...${NC}"
    if [ -n "$CONTAINERS" ]; then
        # Stop specific containers
        IFS=',' read -ra CONTAINER_ARRAY <<< "$CONTAINERS"
        for container in "${CONTAINER_ARRAY[@]}"; do
            "$DOCKER_MANAGER" stop "$container"
        done
    else
        # Stop all containers
        "$DOCKER_MANAGER" stop
    fi
else
    echo -e "\n${YELLOW}Keeping containers running. To stop them manually:${NC}"
    echo "$DOCKER_MANAGER stop"
fi

# Exit with test exit code
exit $TEST_EXIT_CODE