# V Move You — Hostinger Backend (Node.js + MySQL)

Standalone Express backend that replaces the Supabase backend.
Designed for **Hostinger Business Web Hosting** (Node.js app + MySQL database).

---

## 1. Hostinger pe setup (one-time)

### A) MySQL database banayein
1. hPanel → **Databases → MySQL Databases**
2. New database create karein. Note karein:
   - Database name (e.g. `u123456789_vmy`)
   - Username (e.g. `u123456789_vmy`)
   - Password

### B) Node.js app create karein
1. hPanel → **Advanced → Node.js**
2. **Create Application**:
   - Node version: **18.x** ya higher
   - Application root: `vmoveyou-backend`
   - Application URL: `api.your-domain.com` (subdomain banalein) ya `your-domain.com/api`
   - Application startup file: `server.js`
3. Subdomain (e.g. `api.your-domain.com`) hPanel → **Domains → Subdomains** se banayein.

### C) Files upload karein
File Manager se ya FTP se is `backend/` folder ka pura content `vmoveyou-backend/` mein upload karein
(skip karein: `node_modules`, `.env`, `uploads`).

### D) `.env` banayein
`.env.example` ko `.env` ke naam se copy karein aur values fill karein:
- `DB_HOST=localhost` (Hostinger pe local hota hai)
- `DB_NAME`, `DB_USER`, `DB_PASSWORD` — step A se
- `JWT_SECRET` — terminal mein `openssl rand -hex 48` se generate karein
- `UPLOAD_DIR=/home/u123456789/vmoveyou-uploads` (absolute path, public_html ke BAHAR rakhein)
- `CORS_ORIGIN=https://your-frontend.com`
- `PUBLIC_BASE_URL=https://api.your-domain.com`

### E) Dependencies install + DB init
Hostinger Node.js panel mein **"Run NPM Install"** click karein. Phir terminal kholein:

```bash
cd ~/vmoveyou-backend
node scripts/init-db.js
node scripts/create-admin.js admin@yoursite.com YourStrongPassword
```

### F) App start karein
Node.js panel mein **"Restart"** click karein. Test:
```
https://api.your-domain.com/health
```
Aapko `{"ok":true,...}` milna chahiye.

---

## 2. API endpoints (frontend ke liye reference)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/admin/login` | — | `{email,password}` → `{token}` |
| GET  | `/api/admin/me` | Bearer | Verify admin token |
| GET  | `/api/ads/active` | — | Public active ads |
| GET  | `/api/ads` | Bearer | All ads (admin) |
| POST | `/api/ads` | Bearer | Create ad |
| PUT  | `/api/ads/:id` | Bearer | Update ad |
| DELETE | `/api/ads/:id` | Bearer | Delete ad |
| POST | `/api/ads/upload` | Bearer | Upload image (multipart `file`) |
| POST | `/api/transfers` | — | Create transfer |
| POST | `/api/transfers/:id/files` | — | Upload files (multipart `files`) |
| GET  | `/api/transfers/by-code/:code` | — | Lookup by share code |
| GET  | `/api/transfers/by-code/:code/file/:fileId` | — | Download file |
| POST | `/api/visitors/heartbeat` | — | `{session_id, path}` |
| GET  | `/api/visitors/live` | Bearer | Live visitor count |

---

## 3. Frontend ko switch karna (jab backend live ho jaye)

Frontend ka code maine abhi nahi chheda. Switch karne ke liye:

1. GitHub repo ke `.env` mein add karein:
   ```
   VITE_API_BASE_URL=https://api.your-domain.com
   ```
2. `src/lib/` mein ek chhota API client banayein (`src/lib/api.ts`) jo Supabase calls ki jagah `fetch(VITE_API_BASE_URL + ...)` use kare.
3. `ads.ts`, `upload.ts`, `visitors.ts`, `admin.functions.ts`, `downloads.functions.ts`, `d.$code.tsx`, `admin.index.tsx`, `admin.login.tsx`, `index.tsx` ko naye client pe point karein.

Yeh frontend rewrite alag step hai — aap kahein toh main yeh bhi parallel files ke saath kar dunga.

---

## 4. Maintenance

- **Expired transfers cleanup** (optional cron, Hostinger Cron Jobs):
  ```bash
  0 3 * * * /usr/bin/mysql -u USER -pPASS DBNAME -e "DELETE FROM transfers WHERE expires_at < NOW();"
  ```
- **Logs**: Node.js panel → "View logs"
- **Restart**: Node.js panel → "Restart"
