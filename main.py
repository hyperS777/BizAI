import sys
from pathlib import Path

_root = Path(__file__).resolve().parent
_backend = _root / "backend"
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from backend.main import app  # noqa: F401
