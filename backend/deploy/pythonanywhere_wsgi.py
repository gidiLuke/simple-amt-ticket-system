"""PythonAnywhere WSGI template."""

import sys
from pathlib import Path

project_home = Path("/home/<your-username>/simple-amt-ticket-system")
backend_home = project_home / "backend"

if str(backend_home) not in sys.path:
    sys.path.insert(0, str(backend_home))

from app.main import app as application  # noqa: E402

