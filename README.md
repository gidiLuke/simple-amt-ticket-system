# 🎟️ Simple AMT Ticket System

This is a project for office fun, 100% vibe coded.

Welcome to a tiny-but-mighty office queue system:

- 📱 **User scans QR code** at the door
- ⚡ **Ticket is created instantly**
- 🔢 **Ticket number appears on the user’s phone**
- 🧑‍💼 **Agent dashboard receives the new ticket + sound alert**
- ✅ **Agent clicks ticket to call user, notify phone, and close ticket**

No auth. No heavy database. Just smooth flow and clean UI.

---

## 🧱 Tech Stack

- **Backend:** FastAPI
- **Frontend:** Vanilla HTML/CSS/JS (two apps: `user` and `agent`)
- **Hosting (frontend):** GitHub Pages
- **Hosting (backend):** PythonAnywhere (free tier friendly)
- **Automation:** GitHub Actions (CI + CD)
- **Dev env:** VS Code DevContainer + workspace

---

## 📁 Project Structure

```text
.
├── backend/
│   ├── app/
│   ├── tests/
│   └── deploy/
├── frontends/
│   ├── agent/
│   ├── user/
│   ├── config.js
│   └── styles.css
├── .devcontainer/
├── .github/workflows/
└── simple-amt-ticket-system.code-workspace
```

---

## 🚀 Local Development

### 1) Open in VS Code workspace

Open `simple-amt-ticket-system.code-workspace`.

### 2) Start backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

### 3) Run frontends

Serve `frontends/` with any static server (e.g. VS Code Live Server).

Set `frontends/config.js`:

```js
window.APP_CONFIG = {
  API_BASE_URL: "http://localhost:8000"
};
```

Open:

- User app: `.../frontends/user/`
- Agent app: `.../frontends/agent/`

---

## 🧪 Tests

```bash
cd backend
pytest -q
```

---

## 🌐 Deployment

## Frontends → GitHub Pages

Workflow: `.github/workflows/deploy-frontends.yml`

It deploys `frontends/` directly to Pages.

After deploy:
- `https://<username>.github.io/<repo>/user/`
- `https://<username>.github.io/<repo>/agent/`

## Backend → PythonAnywhere (Free Tier)

This project now uses the PythonAnywhere API for automated backend deploys. That means:

- no SSH setup
- no GitHub webhook endpoint inside the app
- no server-side deploy secret

The Bash setup below is interactive. You can paste it into a PythonAnywhere Bash console without editing the command block first.

### One-time setup on PythonAnywhere

1. Commit and push your local changes to GitHub before doing anything on PythonAnywhere. The PythonAnywhere clone can only see files that are already on GitHub.
2. In the PythonAnywhere Web tab, create a new web app for your PythonAnywhere domain.
3. Choose `Manual configuration`.
4. Pick Python `3.13` for the web app.
5. Open a Bash console in PythonAnywhere and run these commands exactly:

   ```bash
   export PA_USERNAME=$(basename "$HOME")
   export PA_PYTHON=/usr/bin/python3.13
   export PA_WSGI_FILE=/var/www/${PA_USERNAME}_eu_pythonanywhere_com_wsgi.py
   cd ~
   if [ -d ~/simple-amt-ticket-system/.git ]; then
     git -C ~/simple-amt-ticket-system pull --ff-only origin main
   else
     git clone https://github.com/gidiLuke/simple-amt-ticket-system.git
   fi
   if [ ! -x ~/.virtualenvs/amt-tickets/bin/python ]; then
     mkvirtualenv --python="$PA_PYTHON" amt-tickets
   fi
   workon amt-tickets
   pip install -r ~/simple-amt-ticket-system/backend/requirements.txt
   python -c "import os; from pathlib import Path; username = os.environ['PA_USERNAME']; wsgi_path = Path(os.environ['PA_WSGI_FILE']); template = Path(f'/home/{username}/simple-amt-ticket-system/backend/deploy/pythonanywhere_wsgi.py'); wsgi_path.write_text(template.read_text().replace('<your-username>', username)); print(f'Updated {wsgi_path}')"
   ```

  This block derives `PA_USERNAME` automatically from your home directory, so on PythonAnywhere it resolves from `/home/<username>`. It sets `PA_WSGI_FILE` explicitly to the standard EU PythonAnywhere WSGI path on every run, which avoids stale shell values from previous attempts. If your WSGI file lives somewhere else, replace that one line before running the block. It is safe to rerun: it updates an existing clone, reuses an existing virtualenv, reinstalls requirements, and rewrites the WSGI file.

6. In the PythonAnywhere Web tab, open the generated WSGI file and make sure it contains your username in the paths.
7. Click `Reload` for the web app.

After that, your backend should be served from:

your PythonAnywhere domain

### Later updates on PythonAnywhere

When you change Python dependencies or want to update manually from a Bash console, run:

```bash
export PA_USERNAME=$(basename "$HOME")
export PA_WSGI_FILE=/var/www/${PA_USERNAME}_eu_pythonanywhere_com_wsgi.py
cd ~/simple-amt-ticket-system
git pull --ff-only origin main
workon amt-tickets
pip install -r ~/simple-amt-ticket-system/backend/requirements.txt
touch "$PA_WSGI_FILE"
```

### Automatic deploy via GitHub Actions + PythonAnywhere API

The backend deploy workflow is [.github/workflows/deploy-backend-pythonanywhere.yml](/workspaces/simple-amt-ticket-system/.github/workflows/deploy-backend-pythonanywhere.yml). It uploads the `backend/` tree with the PythonAnywhere Files API and then reloads the web app with the Webapps API.

Configure these GitHub settings:

Repository secret:

- `PA_API_TOKEN`: your PythonAnywhere API token

Repository variables or secrets:

- `PA_API_HOST`: `eu.pythonanywhere.com` for EU accounts or `www.pythonanywhere.com` for US accounts
- `PA_USERNAME`: your PythonAnywhere username
- `PA_WEBAPP_DOMAIN`: your full web app domain, for example `yourname.eu.pythonanywhere.com`

Behavior:

- On pushes to `main` that touch `backend/**`, the workflow uploads backend files to `/home/<username>/simple-amt-ticket-system/backend`.
- Files under `backend/data/` are preserved so `tickets.json` is not overwritten.
- The workflow reloads the web app after upload.

Notes:

- This works on free PythonAnywhere accounts because it uses the HTTPS API rather than SSH/SFTP.
- Dependency changes are not fully automated. If `backend/requirements.txt` changes, you must open a PythonAnywhere Bash console and run `workon amt-tickets && pip install -r ~/simple-amt-ticket-system/backend/requirements.txt`.
- The GitHub Actions workflow detects changes to `backend/requirements.txt` and ends with a warning plus a job summary note when that manual step is required.
- The workflow also fails early with a clear summary if any required PythonAnywhere GitHub settings are missing.
- The workflow no longer needs `PA_SSH_HOST`, `PA_SSH_USER`, `PA_SSH_KEY`, or a GitHub webhook secret.

---

## 📷 QR Code Setup

Generate a QR code that points to:

`https://<username>.github.io/<repo>/user/?api=<your-backend-url>`

Example:

`https://myname.github.io/simple-amt-ticket-system/user/?api=https://myname.pythonanywhere.com`

Print it, stick it on the office door, and you’re live 🎉

---

## 🧠 Notes

- Ticket data is persisted in a local JSON file on backend (`backend/data/tickets.json`) for free-tier simplicity.
- No auth by design (as requested).
- Polling is used instead of websockets to stay hosting-friendly for static pages + free backend tiers.

---

## 💬 Open Source Vibes

If you improve the UX, add sound packs, or make the queue smarter — PRs are welcome.
Let’s make waiting in line less boring 🙌
