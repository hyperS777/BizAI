#!/bin/bash
set -e

echo "=== BizAI Azure App Service Starting ==="

# 1. Add .python_packages to PYTHONPATH if present
if [ -d "/home/site/wwwroot/.python_packages/lib/site-packages" ]; then
    echo "Found /home/site/wwwroot/.python_packages..."
    export PYTHONPATH="/home/site/wwwroot/.python_packages/lib/site-packages:${PYTHONPATH}"
fi
if [ -d "$(pwd)/.python_packages/lib/site-packages" ]; then
    echo "Found local .python_packages..."
    export PYTHONPATH="$(pwd)/.python_packages/lib/site-packages:${PYTHONPATH}"
fi

# 2. Activate virtual environment if present
if [ -f "/antenv/bin/activate" ]; then
    source /antenv/bin/activate
elif [ -f "/home/site/wwwroot/antenv/bin/activate" ]; then
    source /home/site/wwwroot/antenv/bin/activate
elif [ -f "./antenv/bin/activate" ]; then
    source ./antenv/bin/activate
fi

# 3. Add backend and root directory to PYTHONPATH
export PYTHONPATH="$(pwd)/backend:$(pwd):${PYTHONPATH}"

PORT="${PORT:-8000}"
echo "Binding to 0.0.0.0:$PORT with uvicorn..."
exec python -m uvicorn main:app --host 0.0.0.0 --port "$PORT"
