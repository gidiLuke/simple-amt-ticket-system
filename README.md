# 🎟️ Simple AMT Ticket System

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

Replace the placeholders in this section before running any commands:

- `<pa-username>`: your PythonAnywhere username
- `<pa-domain>`: your full PythonAnywhere domain, for example `<pa-username>.eu.pythonanywhere.com`
- `<pa-python>`: the Python binary available on your account, for example `/usr/bin/python3.10`

### One-time setup on PythonAnywhere

1. In the PythonAnywhere Web tab, create a new web app for `<pa-domain>`.
2. Choose `Manual configuration`.
3. Pick a Python version that matches your account options, ideally Python `3.10` or newer.
4. Open a Bash console in PythonAnywhere and run these commands exactly:

   ```bash
   cd ~
   git clone https://github.com/gidiLuke/simple-amt-ticket-system.git
   mkvirtualenv --python=<pa-python> amt-tickets
   workon amt-tickets
   pip install -r ~/simple-amt-ticket-system/backend/requirements.txt
   cp ~/simple-amt-ticket-system/backend/deploy/pythonanywhere_post_merge.sample ~/simple-amt-ticket-system/.git/hooks/post-merge
   sed -i 's/<your-username>/<pa-username>/g' ~/simple-amt-ticket-system/.git/hooks/post-merge
   chmod +x ~/simple-amt-ticket-system/.git/hooks/post-merge
   python - <<'PY'
   from pathlib import Path
   username = '<pa-username>'
   wsgi_path = Path(f'/var/www/{username}_eu_pythonanywhere_com_wsgi.py')
   template = Path(f'/home/{username}/simple-amt-ticket-system/backend/deploy/pythonanywhere_wsgi.py')
   wsgi_path.write_text(template.read_text().replace('<your-username>', username))
   print(f'Updated {wsgi_path}')
   PY
   ```

5. In the PythonAnywhere Web tab, open the generated WSGI file in `/var/www/` and make sure it contains your `<pa-username>` in the paths.
6. In the PythonAnywhere Web tab, add an environment variable named `GITHUB_WEBHOOK_SECRET` with a long random value.
7. Click `Reload` for the web app.

After that, your backend should be served from:

`https://<pa-domain>`

### Later updates on PythonAnywhere

When you change Python dependencies or want to update manually from a Bash console, run:

```bash
cd ~/simple-amt-ticket-system
git pull --ff-only origin main
workon amt-tickets
pip install -r ~/simple-amt-ticket-system/backend/requirements.txt
touch /var/www/<pa-username>_eu_pythonanywhere_com_wsgi.py
```

### Optional auto-update via GitHub webhook

This project includes a webhook endpoint at `/api/deploy/github` that can pull new code directly from GitHub on PythonAnywhere free accounts.

On GitHub:

1. Open your repository settings.
2. Go to Webhooks.
3. Add a webhook with:
   - Payload URL: `https://<your-pythonanywhere-domain>/api/deploy/github`
   - Content type: `application/json`
   - Secret: the same value as `GITHUB_WEBHOOK_SECRET`
   - Events: `Just the push event`

Behavior:

- Only signed GitHub requests are accepted.
- Only pushes to `main` are applied.
- The app runs `git pull --ff-only origin main` inside the cloned repo.
- The `post-merge` hook touches the WSGI file so PythonAnywhere reloads the app.

Notes:

- This works best when the GitHub repo is public, which matches PythonAnywhere free-tier usage.
- If you change Python dependencies, you still need to run `pip install -r ~/simple-amt-ticket-system/backend/requirements.txt` in a PythonAnywhere Bash console.
- The GitHub Actions workflow in `.github/workflows/deploy-backend-pythonanywhere.yml` is left as manual-only because the SSH-based deploy path requires a paid PythonAnywhere account.

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
