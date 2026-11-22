#!/bin/bash
set +e

echo "=== BizAI Azure App Service Starting ==="
echo "Current directory: $(pwd)"

# 1. Add all potential package paths to PYTHONPATH and PATH
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

for b in \
    "$(pwd)/.python_packages/bin" \
    "$(pwd)/python_packages/bin" \
    "/home/site/wwwroot/.python_packages/bin" \
    "/home/site/wwwroot/python_packages/bin" \
    "/antenv/bin"
do
    if [ -d "$b" ]; then
        echo "Adding binary directory to PATH: $b"
        export PATH="$b:${PATH}"
    fi
done

# 2. Add backend and root directory to PYTHONPATH
export PYTHONPATH="$(pwd)/backend:$(pwd):${PYTHONPATH}"

PORT="${PORT:-8000}"
echo "Starting FastAPI server on port $PORT..."

# Try uvicorn via python module
if python -m uvicorn main:app --host 0.0.0.0 --port "$PORT"; then
    exit 0
fi

# Fallback 1: python3 -m uvicorn
if python3 -m uvicorn main:app --host 0.0.0.0 --port "$PORT"; then
    exit 0
fi

# Fallback 2: gunicorn with uvicorn worker
if gunicorn -w 2 -k uvicorn.workers.UvicornWorker main:app --bind 0.0.0.0:"$PORT" --timeout 600; then
    exit 0
fi

# Fallback 3: direct uvicorn binary
exec uvicorn main:app --host 0.0.0.0 --port "$PORT"
