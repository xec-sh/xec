#!/bin/bash

# Run tests in all supported runtimes
# Usage: ./run-all-tests.sh

set -e

echo "================================"
echo "TUI Tester - Multi-Runtime Tests"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run tests in a runtime
run_tests() {
    local runtime=$1
    local command=$2
    
    echo -e "${YELLOW}Running tests with $runtime...${NC}"
    echo "--------------------------------"
    
    if command -v $command &> /dev/null; then
        if $command; then
            echo -e "${GREEN}✓ $runtime tests passed${NC}"
            ((PASSED_TESTS++))
        else
            echo -e "${RED}✗ $runtime tests failed${NC}"
            ((FAILED_TESTS++))
        fi
    else
        echo -e "${YELLOW}⚠ $runtime not available, skipping${NC}"
    fi
    
    ((TOTAL_TESTS++))
    echo ""
}

# Node.js tests with Vitest
echo "1. Node.js Tests (Vitest)"
echo "========================="
if command -v node &> /dev/null; then
    echo "Node version: $(node --version)"
    npm test 2>&1 | tee node-test.log
    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        echo -e "${GREEN}✓ Node.js tests passed${NC}"
        ((PASSED_TESTS++))
    else
        echo -e "${RED}✗ Node.js tests failed${NC}"
        ((FAILED_TESTS++))
    fi
else
    echo -e "${YELLOW}⚠ Node.js not available${NC}"
fi
((TOTAL_TESTS++))
echo ""

# Bun tests
echo "2. Bun Tests"
echo "============"
if command -v bun &> /dev/null; then
    echo "Bun version: $(bun --version)"
    
    # Run Bun-specific tests
    if [ -f "test/runtimes/bun.test.ts" ]; then
        bun test test/runtimes/bun.test.ts 2>&1 | tee bun-test.log
        if [ ${PIPESTATUS[0]} -eq 0 ]; then
            echo -e "${GREEN}✓ Bun tests passed${NC}"
            ((PASSED_TESTS++))
        else
            echo -e "${RED}✗ Bun tests failed${NC}"
            ((FAILED_TESTS++))
        fi
    else
        echo "No Bun-specific tests found"
    fi
else
    echo -e "${YELLOW}⚠ Bun not available${NC}"
fi
((TOTAL_TESTS++))
echo ""

# Deno tests
echo "3. Deno Tests"
echo "============="
if command -v deno &> /dev/null; then
    echo "Deno version: $(deno --version | head -n1)"
    
    # Run Deno-specific tests
    if [ -f "test/runtimes/deno.test.ts" ]; then
        deno test --allow-all test/runtimes/deno.test.ts 2>&1 | tee deno-test.log
        if [ ${PIPESTATUS[0]} -eq 0 ]; then
            echo -e "${GREEN}✓ Deno tests passed${NC}"
            ((PASSED_TESTS++))
        else
            echo -e "${RED}✗ Deno tests failed${NC}"
            ((FAILED_TESTS++))
        fi
    else
        echo "No Deno-specific tests found"
    fi
else
    echo -e "${YELLOW}⚠ Deno not available${NC}"
fi
((TOTAL_TESTS++))
echo ""

# Integration tests (requires tmux)
echo "4. Integration Tests (Tmux)"
echo "============================"
if command -v tmux &> /dev/null; then
    echo "Tmux version: $(tmux -V)"
    
    # Kill any existing test sessions
    tmux kill-server 2>/dev/null || true
    
    # Run integration tests with Node
    if command -v node &> /dev/null; then
        npm test -- test/tmux/tmux-tester.test.ts 2>&1 | tee integration-test.log
        if [ ${PIPESTATUS[0]} -eq 0 ]; then
            echo -e "${GREEN}✓ Integration tests passed${NC}"
            ((PASSED_TESTS++))
        else
            echo -e "${RED}✗ Integration tests failed${NC}"
            ((FAILED_TESTS++))
        fi
    fi
else
    echo -e "${YELLOW}⚠ Tmux not available, skipping integration tests${NC}"
fi
((TOTAL_TESTS++))
echo ""

# Summary
echo "================================"
echo "Test Summary"
echo "================================"
echo "Total test suites: $TOTAL_TESTS"
echo -e "Passed: ${GREEN}$PASSED_TESTS${NC}"
echo -e "Failed: ${RED}$FAILED_TESTS${NC}"
echo -e "Skipped: ${YELLOW}$((TOTAL_TESTS - PASSED_TESTS - FAILED_TESTS))${NC}"
echo ""

if [ $FAILED_TESTS -eq 0 ]; then
    echo -e "${GREEN}✓ All available tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Check the logs for details.${NC}"
    exit 1
fi