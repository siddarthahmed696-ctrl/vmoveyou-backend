const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const { pool } = require("./db");

const router = express.Router();

const MAX_MB = Number(process.env.MAX_UPLOAD_MB || 800);
const MAX_BYTES = MAX_MB * 1024 * 1024;
const EXPIRY_DAYS = Number(process.env.TRANSFER_EXPIRY_DAYS || 3);
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const createLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
const downloadLimiter = rateLimit({ windowMs: 60 * 1000, max: 120 });

// Per-transfer disk storage
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const transferId = req.params.id;
    const dir = path.join(UPLOAD_DIR, transferId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: MAX_BYTES } });

// ── Create transfer
router.post("/", createLimiter, async (req, res) => {
  const { title, message, sender_email, recipient_email, total_size } = req.body || {};
  const size = Number(total_size || 0);
  if (size < 0 || size > MAX_BYTES) {
    return res.status(413).json({ error: `Free transfers are limited to ${MAX_MB} MB` });
  }

  const id = crypto.randomUUID();
  const shareCode = crypto.randomBytes(8).toString("hex");
  const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86400 * 1000);

  await pool.query(
    `INSERT INTO transfers (id, share_code, title, message, sender_email, recipient_email, total_size, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, shareCode, title || null, message || null, sender_email || null, recipient_email || null, size, expiresAt]
  );

  res.json({ id, share_code: shareCode });
});

// ── Upload file(s) into transfer
router.post("/:id/files", upload.array("files", 50), async (req, res) => {
  const transferId = req.params.id;
  const [rows] = await pool.query("SELECT id, total_size FROM transfers WHERE id = ? LIMIT 1", [transferId]);
  if (!rows[0]) return res.status(404).json({ error: "Transfer not found" });

  const files = req.files || [];
  const totalNew = files.reduce((s, f) => s + f.size, 0);
  if (totalNew > MAX_BYTES) return res.status(413).json({ error: `Free transfers are limited to ${MAX_MB} MB` });

  const inserts = files.map((f) => [
    crypto.randomUUID(),
    transferId,
    f.originalname,
    f.size,
    f.mimetype || null,
    path.relative(UPLOAD_DIR, f.path),
  ]);
  if (inserts.length) {
    await pool.query(
      `INSERT INTO transfer_files (id, transfer_id, file_name, file_size, content_type, storage_path) VALUES ?`,
      [inserts]
    );
  }

  res.json({ ok: true, count: inserts.length });
});

// ── Public lookup by share code
router.get("/by-code/:code", async (req, res) => {
  const code = req.params.code;
  const [tRows] = await pool.query(
    `SELECT id, share_code, title, message, sender_email, total_size, download_count, created_at, expires_at
     FROM transfers WHERE share_code = ? LIMIT 1`,
    [code]
  );
  const transfer = tRows[0];
  if (!transfer) return res.status(404).json({ error: "Not found" });
  if (new Date(transfer.expires_at) < new Date()) return res.status(410).json({ error: "Expired" });

  const [files] = await pool.query(
    `SELECT id, file_name, file_size, content_type FROM transfer_files WHERE transfer_id = ? ORDER BY created_at`,
    [transfer.id]
  );

  res.json({ transfer, files });
});

// ── Download a single file
router.get("/by-code/:code/file/:fileId", downloadLimiter, async (req, res) => {
  const { code, fileId } = req.params;
  const [rows] = await pool.query(
    `SELECT f.file_name, f.content_type, f.storage_path, t.expires_at, t.share_code
     FROM transfer_files f JOIN transfers t ON t.id = f.transfer_id
     WHERE f.id = ? AND t.share_code = ? LIMIT 1`,
    [fileId, code]
  );
  const row = rows[0];
  if (!row) return res.status(404).json({ error: "Not found" });
  if (new Date(row.expires_at) < new Date()) return res.status(410).json({ error: "Expired" });

  const filePath = path.join(UPLOAD_DIR, row.storage_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File missing" });

  await pool.query(`UPDATE transfers SET download_count = download_count + 1 WHERE share_code = ?`, [code]);

  res.setHeader("Content-Type", row.content_type || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(row.file_name)}"`);
  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
