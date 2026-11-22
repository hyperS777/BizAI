#!/bin/bash
set -e

echo "=== BizAI Azure App Service Starting ==="

# 1. Activate Oryx virtual environment if present
if [ -f "/antenv/bin/activate" ]; then
    echo "Found /antenv, activating..."
    source /antenv/bin/activate
elif [ -f "/home/site/wwwroot/antenv/bin/activate" ]; then
    echo "Found /home/site/wwwroot/antenv, activating..."
    source /home/site/wwwroot/antenv/bin/activate
elif [ -f "./antenv/bin/activate" ]; then
    echo "Found local antenv, activating..."
    source ./antenv/bin/activate
fi

# 2. Verify uvicorn is available, otherwise install dependencies
if ! command -v uvicorn >/dev/null 2>&1; then
    echo "uvicorn not found in PATH! Installing from requirements.txt..."
    pip install --no-cache-dir -r requirements.txt
fi

# 3. Add backend directory to PYTHONPATH
export PYTHONPATH="${PYTHONPATH}:$(pwd)/backend:$(pwd)"

PORT="${PORT:-8000}"
echo "Binding to 0.0.0.0:$PORT with uvicorn..."
exec python -m uvicorn main:app --host 0.0.0.0 --port "$PORT"
