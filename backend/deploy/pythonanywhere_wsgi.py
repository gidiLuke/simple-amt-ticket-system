"""
PythonAnywhere WSGI template.

Copy the contents into your PythonAnywhere WSGI config file and update paths:
1) Replace <your-username>
2) Ensure this repo is cloned at /home/<your-username>/simple-amt-ticket-system
3) Ensure your virtualenv exists at /home/<your-username>/.virtualenvs/amt-tickets
"""

import sys
from pathlib import Path

project_home = Path("/home/<your-username>/simple-amt-ticket-system")
backend_home = project_home / "backend"

if str(backend_home) not in sys.path:
    sys.path.insert(0, str(backend_home))

from app.main import app as application  # noqa: E402

