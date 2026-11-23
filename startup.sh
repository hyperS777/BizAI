#!/bin/bash
set +e

echo "=== BizAI Azure App Service Starting ==="
cd /home/site/wwwroot 2>/dev/null || cd "$(dirname "$0")"
echo "Current directory: $(pwd)"

# 1. Activate antenv virtual environment if present
if [ -f "/home/site/wwwroot/antenv/bin/activate" ]; then
    echo "Activating /home/site/wwwroot/antenv virtual environment..."
    source /home/site/wwwroot/antenv/bin/activate
elif [ -f "$(pwd)/antenv/bin/activate" ]; then
    echo "Activating $(pwd)/antenv virtual environment..."
    source "$(pwd)/antenv/bin/activate"
fi

# 2. Add all potential package paths to PYTHONPATH and PATH
for p in \
    "/home/site/wwwroot/antenv/lib/python3.11/site-packages" \
    "$(pwd)/antenv/lib/python3.11/site-packages" \
    "/home/site/wwwroot/__oryx_packages__/lib/python3.11/site-packages" \
    "/home/site/wwwroot/.python_packages/lib/site-packages" \
    "/home/site/wwwroot/python_packages/lib/site-packages" \
    "$(pwd)/.python_packages/lib/site-packages" \
    "$(pwd)/python_packages/lib/site-packages" \
    "/antenv/lib/python3.11/site-packages"
do
    if [ -d "$p" ]; then
        echo "Adding package directory to PYTHONPATH: $p"
        export PYTHONPATH="$p:${PYTHONPATH}"
    fi
done

for b in \
    "/home/site/wwwroot/antenv/bin" \
    "$(pwd)/antenv/bin" \
    "/home/site/wwwroot/.python_packages/bin" \
    "/home/site/wwwroot/python_packages/bin" \
    "$(pwd)/.python_packages/bin" \
    "$(pwd)/python_packages/bin" \
    "/antenv/bin"
do
    if [ -d "$b" ]; then
        echo "Adding binary directory to PATH: $b"
        export PATH="$b:${PATH}"
    fi
done

# 3. Add backend and root directory to PYTHONPATH
export PYTHONPATH="$(pwd)/backend:$(pwd):${PYTHONPATH}"

PORT="${PORT:-${WEBSITES_PORT:-8000}}"

# 4. Resolve working Python interpreter
PYTHON_CMD="python"
if ! $PYTHON_CMD -c "print(1)" >/dev/null 2>&1; then
    for candidate in \
        "python3" \
        "/opt/python/3.11.18/bin/python" \
        "/opt/python/3.11.10/bin/python" \
        "/opt/python/3.11/bin/python" \
        "/usr/local/bin/python3" \
        "/usr/bin/python3"
    do
        if $candidate -c "print(1)" >/dev/null 2>&1; then
            PYTHON_CMD="$candidate"
            break
        fi
    done
fi
echo "Using Python binary: $PYTHON_CMD ($($PYTHON_CMD --version 2>&1))"

echo "Starting FastAPI server on port $PORT using $PYTHON_CMD..."

# Try uvicorn via python module
if $PYTHON_CMD -m uvicorn main:app --host 0.0.0.0 --port "$PORT"; then
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
