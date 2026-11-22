#!/bin/bash

echo "=== BizAI Azure App Service Starting ==="
echo "Current directory: $(pwd)"

# 1. Add all potential package paths to PYTHONPATH
for p in \
    "$(pwd)/.python_packages/lib/site-packages" \
    "$(pwd)/python_packages/lib/site-packages" \
    "/home/site/wwwroot/.python_packages/lib/site-packages" \
    "/home/site/wwwroot/python_packages/lib/site-packages" \
    "/antenv/lib/python3.11/site-packages"
do
    if [ -d "$p" ]; then
        echo "Adding package directory to PYTHONPATH: $p"
        export PYTHONPATH="$p:${PYTHONPATH}"
    fi
done

# 2. Add backend and root directory to PYTHONPATH
export PYTHONPATH="$(pwd)/backend:$(pwd):${PYTHONPATH}"

PORT="${PORT:-8000}"
echo "Starting uvicorn on 0.0.0.0:$PORT..."
exec python -m uvicorn main:app --host 0.0.0.0 --port "$PORT"
