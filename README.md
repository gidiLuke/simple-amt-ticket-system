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

### One-time setup on PythonAnywhere

1. Create a web app (manual configuration, Python 3.10+).
2. Clone this repo into home folder:
   ```bash
   git clone <your-repo-url> ~/simple-amt-ticket-system
   ```
3. Create virtualenv:
   ```bash
   mkvirtualenv --python=/usr/bin/python3.10 amt-tickets
   pip install -r ~/simple-amt-ticket-system/backend/requirements.txt
   ```
4. Update your WSGI file with template from:
   `backend/deploy/pythonanywhere_wsgi.py`
5. Reload web app.

### Optional CI/CD deploy via GitHub Actions

Workflow: `.github/workflows/deploy-backend-pythonanywhere.yml`

Configure secrets:

- `PA_SSH_HOST` (e.g. `ssh.pythonanywhere.com`)
- `PA_SSH_USER`
- `PA_SSH_KEY` (private key)
- `PA_WSGI_FILE` (absolute path to WSGI config file)

On push to `main`, workflow SSHes into PythonAnywhere, pulls latest code, installs deps, and reloads app.

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
