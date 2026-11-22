#!/bin/bash
PORT="${PORT:-8000}"
python -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port "$PORT"
