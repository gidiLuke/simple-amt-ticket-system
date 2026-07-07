from __future__ import annotations

import hashlib
import hmac
import subprocess
from pathlib import Path
from typing import Callable


DeployRunner = Callable[[Path, str, str, Path | None], None]


def verify_github_signature(secret: str, payload: bytes, signature: str | None) -> bool:
    if not signature or not signature.startswith("sha256="):
        return False

    expected = hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={expected}", signature)


def run_git_deploy(repo_dir: Path, remote: str, branch: str, wsgi_file: Path | None) -> None:
    subprocess.run(
        ["git", "-C", str(repo_dir), "pull", "--ff-only", remote, branch],
        check=True,
        capture_output=True,
        text=True,
    )

    if wsgi_file is not None:
        wsgi_file.touch()