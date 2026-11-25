#!/bin/bash
set +e

echo "=== BizAI Azure App Service Starting ==="
cd /home/site/wwwroot 2>/dev/null || cd "$(dirname "$0")"
echo "Current directory: $(pwd)"

# 1. Activate Oryx antenv only if its python binary is actually valid in this container
for venv_dir in "/home/site/wwwroot/antenv" "$(pwd)/antenv" /tmp/*/antenv; do
    if [ -x "${venv_dir}/bin/python" ] && "${venv_dir}/bin/python" -c "import uvicorn" >/dev/null 2>&1; then
        echo "Activating working virtual environment: ${venv_dir}"
        source "${venv_dir}/bin/activate"
        break
    fi
done

# 2. Add target-installed and Oryx package directories to PYTHONPATH & PATH
for p in \
    "/home/site/wwwroot/.python_packages/lib/site-packages" \
    "$(pwd)/.python_packages/lib/site-packages" \
    "/home/site/wwwroot/python_packages/lib/site-packages" \
    "$(pwd)/python_packages/lib/site-packages" \
    "/home/site/wwwroot/__oryx_packages__/lib/python3.11/site-packages" \
    "/home/site/wwwroot/antenv/lib/python3.11/site-packages"
do
    if [ -d "$p" ]; then
        echo "Adding package directory to PYTHONPATH: $p"
        export PYTHONPATH="$p:${PYTHONPATH}"
    fi
done

for b in \
    "/home/site/wwwroot/.python_packages/lib/site-packages/bin" \
    "/home/site/wwwroot/.python_packages/bin" \
    "$(pwd)/.python_packages/bin" \
    "/home/site/wwwroot/antenv/bin"
do
    if [ -d "$b" ]; then
        export PATH="$b:${PATH}"
    fi
done

# 3. Add backend and root directory to PYTHONPATH
export PYTHONPATH="$(pwd)/backend:$(pwd):${PYTHONPATH}"

PORT="${PORT:-${WEBSITES_PORT:-8000}}"

# 4. Resolve a working Python interpreter that can import uvicorn and main
PYTHON_CMD=""
for candidate in \
    "$(command -v python 2>/dev/null)" \
    "$(command -v python3 2>/dev/null)" \
    "/opt/python/3.11.18/bin/python" \
    "/opt/python/3.11.10/bin/python" \
    "/opt/python/3.11/bin/python" \
    "/usr/local/bin/python3" \
    "/usr/bin/python3"
do
    if [ -n "$candidate" ] && "$candidate" -c "import uvicorn, main" >/dev/null 2>&1; then
        PYTHON_CMD="$candidate"
        break
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    PYTHON_CMD="$(command -v python3 2>/dev/null || echo /opt/python/3.11.18/bin/python)"
    echo "Fallback: installing requirements with $PYTHON_CMD..."
    "$PYTHON_CMD" -m pip install --no-cache-dir -r requirements.txt 2>&1 || true
fi

echo "Using Python binary: $PYTHON_CMD ($($PYTHON_CMD --version 2>&1))"
echo "Starting FastAPI server on port $PORT..."

exec "$PYTHON_CMD" -m uvicorn main:app --host 0.0.0.0 --port "$PORT"
