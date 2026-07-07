from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Deploy backend files to PythonAnywhere via API")
    parser.add_argument("--project-root", default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument("--backend-root", default=None)
    parser.add_argument("--host", default=os.getenv("PA_API_HOST"))
    parser.add_argument("--username", default=os.getenv("PA_USERNAME"))
    parser.add_argument("--token", default=os.getenv("PA_API_TOKEN"))
    parser.add_argument("--webapp-domain", default=os.getenv("PA_WEBAPP_DOMAIN"))
    parser.add_argument(
        "--remote-root",
        default=os.getenv("PA_REMOTE_ROOT"),
        help="Remote backend directory, defaults to /home/<username>/simple-amt-ticket-system/backend",
    )
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


class PythonAnywhereApi:
    def __init__(self, host: str, username: str, token: str, dry_run: bool = False) -> None:
        self.host = host
        self.username = username
        self.token = token
        self.dry_run = dry_run

    def _url(self, path: str) -> str:
        return f"https://{self.host}{path}"

    def _request(self, method: str, path: str, *, data: bytes | None = None, headers: dict[str, str] | None = None) -> bytes:
        if self.dry_run:
            print(f"DRY RUN {method} {self._url(path)}")
            return b""

        request_headers = {"Authorization": f"Token {self.token}"}
        if headers:
            request_headers.update(headers)

        request = urllib.request.Request(
            self._url(path),
            data=data,
            headers=request_headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(request) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"{method} {path} failed: {exc.code} {detail}") from exc

    def list_remote_files(self, remote_root: Path) -> list[Path]:
        query = urllib.parse.urlencode({"path": str(remote_root)})
        payload = self._request("GET", f"/api/v0/user/{self.username}/files/tree/?{query}")
        if self.dry_run:
            return []
        entries = json.loads(payload.decode("utf-8"))
        return [Path(entry) for entry in entries if not entry.endswith("/")]

    def upload_file(self, remote_path: Path, local_path: Path) -> None:
        file_bytes = local_path.read_bytes()
        boundary = f"----CopilotBoundary{uuid.uuid4().hex}"
        body = (
            f"--{boundary}\r\n"
            f"Content-Disposition: form-data; name=\"content\"; filename=\"{local_path.name}\"\r\n"
            "Content-Type: application/octet-stream\r\n\r\n"
        ).encode("utf-8") + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")
        encoded_path = urllib.parse.quote(str(remote_path), safe="/")
        self._request(
            "POST",
            f"/api/v0/user/{self.username}/files/path{encoded_path}",
            data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
        print(f"Uploaded {local_path} -> {remote_path}")

    def delete_file(self, remote_path: Path) -> None:
        encoded_path = urllib.parse.quote(str(remote_path), safe="/")
        self._request("DELETE", f"/api/v0/user/{self.username}/files/path{encoded_path}")
        print(f"Deleted {remote_path}")

    def reload_webapp(self, domain: str) -> None:
        encoded_domain = urllib.parse.quote(domain, safe="")
        # ASGI websites use the v1 websites endpoint; traditional WSGI apps use v0 webapps.
        try:
            self._request("POST", f"/api/v1/user/{self.username}/websites/{encoded_domain}/reload/")
        except RuntimeError:
            self._request("POST", f"/api/v0/user/{self.username}/webapps/{encoded_domain}/reload/")
        print(f"Reloaded {domain}")


def should_deploy(relative_path: Path) -> bool:
    if any(part in {"__pycache__", ".pytest_cache", "tests", "data"} for part in relative_path.parts):
        return False
    if relative_path.name in {".env"}:
        return False
    return True


def iter_local_files(backend_root: Path) -> list[Path]:
    return sorted(
        path.relative_to(backend_root)
        for path in backend_root.rglob("*")
        if path.is_file() and should_deploy(path.relative_to(backend_root))
    )


def main() -> int:
    args = parse_args()
    project_root = Path(args.project_root).resolve()
    backend_root = Path(args.backend_root).resolve() if args.backend_root else project_root / "backend"

    required = {
        "host": args.host,
        "username": args.username,
        "token": args.token,
        "webapp_domain": args.webapp_domain,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        raise SystemExit(f"Missing required arguments or env vars: {', '.join(missing)}")

    remote_root = Path(args.remote_root or f"/home/{args.username}/simple-amt-ticket-system/backend")
    api = PythonAnywhereApi(args.host, args.username, args.token, dry_run=args.dry_run)

    local_rel_paths = iter_local_files(backend_root)
    local_remote_paths = {remote_root / rel_path for rel_path in local_rel_paths}

    remote_files = api.list_remote_files(remote_root)
    for remote_file in remote_files:
        if remote_file == remote_root / ".env":
            continue
        if remote_file.parts[: len(remote_root.parts)] == remote_root.parts and "data" in remote_file.relative_to(remote_root).parts:
            continue
        if remote_file not in local_remote_paths:
            api.delete_file(remote_file)

    for rel_path in local_rel_paths:
        api.upload_file(remote_root / rel_path, backend_root / rel_path)

    api.reload_webapp(args.webapp_domain)
    return 0


if __name__ == "__main__":
    sys.exit(main())