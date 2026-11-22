import sys
from pathlib import Path

_root = Path(__file__).resolve().parent
_backend = _root / "backend"
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from backend.main import app as fastapi_app


class DualProtocolApp:
    """Supports both ASGI (Uvicorn / ASGI workers) and WSGI (default Gunicorn sync worker)."""

    def __init__(self, inner):
        self.inner = inner
        self.title = getattr(inner, "title", "BizAI")
        try:
            from a2wsgi import ASGIMiddleware
            self._wsgi = ASGIMiddleware(inner)
        except Exception:
            self._wsgi = None

    def __call__(self, *args, **kwargs):
        # WSGI call: app(environ, start_response)
        if len(args) == 2 and callable(args[1]):
            environ, start_response = args[0], args[1]
            if self._wsgi is not None:
                return self._wsgi(environ, start_response)
            start_response("200 OK", [("Content-Type", "application/json")])
            return [b'{"status":"ok","service":"bizai-api"}']

        # ASGI call: app(scope, receive, send)
        if len(args) == 3:
            scope, receive, send = args[0], args[1], args[2]
            return self.inner(scope, receive, send)

        return self.inner(*args, **kwargs)

    def __getattr__(self, name):
        return getattr(self.inner, name)


app = DualProtocolApp(fastapi_app)
