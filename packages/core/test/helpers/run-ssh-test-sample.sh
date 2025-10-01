#!/bin/bash
# Quick test script to verify SSH Docker tests work

echo "Starting Ubuntu container for SSH testing..."
cd "$(dirname "$0")/../../../.."

# Path to docker-ssh-manager.sh in @xec-sh/testing package
DOCKER_MANAGER="./packages/testing/docker-ssh-manager.sh"

# Start just the Ubuntu container
"$DOCKER_MANAGER" start ubuntu-apt

# Wait a moment for container to be ready
sleep 3

# Check status
"$DOCKER_MANAGER" status

# Run a simple connectivity test
echo ""
echo "Running basic SSH connectivity test..."
cd packages/core
yarn test test/integration/ssh-docker-integration.test.ts -t "should connect to ubuntu-apt container"

echo ""
echo "To stop the container, run:"
echo "$DOCKER_MANAGER stop ubuntu-apt"