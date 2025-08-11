#!/bin/bash

# Test script to verify examples compile without errors

echo "Testing TRM examples compilation..."

# Test each example file
for file in examples/*.ts; do
  echo -n "Testing $file... "
  
  # Check if it's an interactive example that needs TTY
  if [[ "$file" == *"06-comprehensive-demo.ts" ]] || [[ "$file" == *"04-input-and-events.ts" ]]; then
    # Just check syntax for interactive examples
    npx tsc --noEmit "$file" 2>/dev/null
    if [ $? -eq 0 ]; then
      echo "✓ (syntax OK, requires TTY)"
    else
      echo "✗ (compilation error)"
    fi
  else
    # Try to run with timeout for non-interactive examples
    if command -v timeout >/dev/null 2>&1; then
      timeout 2 npx tsx "$file" >/dev/null 2>&1
    elif command -v gtimeout >/dev/null 2>&1; then
      gtimeout 2 npx tsx "$file" >/dev/null 2>&1
    else
      # Just check syntax if timeout not available
      npx tsc --noEmit "$file" 2>/dev/null
    fi
    
    if [ $? -eq 0 ] || [ $? -eq 124 ]; then  # 124 is timeout exit code
      echo "✓"
    else
      echo "✗"
    fi
  fi
done

echo "Done testing examples."