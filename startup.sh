#!/bin/bash
set -e

echo "=== BizAI Azure App Service Starting ==="

# 1. Add all potential package paths to PYTHONPATH
for p in \
    "/home/site/wwwroot/.python_packages/lib/site-packages" \
    "/home/site/wwwroot/python_packages/lib/site-packages" \
    "$(pwd)/.python_packages/lib/site-packages" \
    "$(pwd)/python_packages/lib/site-packages" \
    "/antenv/lib/python3.11/site-packages"
do
    if [ -d "$p" ]; then
        echo "Adding to PYTHONPATH: $p"
        export PYTHONPATH="$p:${PYTHONPATH}"
    fi
done

# 2. Add backend and root directory to PYTHONPATH
export PYTHONPATH="$(pwd)/backend:$(pwd):${PYTHONPATH}"

# 3. If uvicorn is still missing from python, self-install into environment
if ! python -c "import uvicorn" >/dev/null 2>&1; then
    echo "uvicorn still missing from PYTHONPATH, running emergency pip install..."
    python -m pip install --no-cache-dir uvicorn fastapi gunicorn a2wsgi pydantic sqlalchemy psycopg2-binary pydantic-settings python-multipart python-jose bcrypt passlib groq google-generativeai
fi

PORT="${PORT:-8000}"
echo "Binding to 0.0.0.0:$PORT with uvicorn..."
exec python -m uvicorn main:app --host 0.0.0.0 --port "$PORT"
