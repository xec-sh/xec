#!/bin/bash
# Quick test script to verify SSH Docker tests work

echo "Starting Ubuntu container for SSH testing..."
cd "$(dirname "$0")/../../../.."

# Start just the Ubuntu container
./packages/ush/test/helpers/docker-ssh-manager.sh start ubuntu-apt

# Wait a moment for container to be ready
sleep 3

# Check status
./packages/ush/test/helpers/docker-ssh-manager.sh status

# Run a simple connectivity test
echo ""
echo "Running basic SSH connectivity test..."
cd packages/ush
yarn test test/integration/ssh-docker-integration.test.ts -t "should connect to ubuntu-apt container"

echo ""
echo "To stop the container, run:"
echo "./packages/ush/test/helpers/docker-ssh-manager.sh stop ubuntu-apt"