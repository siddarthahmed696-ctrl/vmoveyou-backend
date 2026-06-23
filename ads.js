const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { pool } = require("../db");
const { requireAdmin } = require("../auth");

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
const ADS_DIR = path.join(UPLOAD_DIR, "ads");
if (!fs.existsSync(ADS_DIR)) fs.mkdirSync(ADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ADS_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// Public: active ads
router.get("/active", async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT id, heading, tagline, link_url, image_urls, video_url, sort_order
     FROM site_ads WHERE is_active = 1 ORDER BY sort_order ASC, created_at DESC`
  );
  res.json(rows.map((r) => ({ ...r, image_urls: safeJson(r.image_urls) })));
});

// Admin: list all
router.get("/", requireAdmin, async (_req, res) => {
  const [rows] = await pool.query(`SELECT * FROM site_ads ORDER BY sort_order ASC, created_at DESC`);
  res.json(rows.map((r) => ({ ...r, image_urls: safeJson(r.image_urls) })));
});

// Admin: upload image, returns public URL
router.post("/upload", requireAdmin, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  const publicUrl = `${process.env.PUBLIC_BASE_URL}/files/ads/${req.file.filename}`;
  res.json({ url: publicUrl });
});

// Admin: create
router.post("/", requireAdmin, async (req, res) => {
  const { heading, tagline, link_url, image_urls, video_url, is_active, sort_order } = req.body || {};
  if (!heading || !link_url) return res.status(400).json({ error: "heading and link_url required" });
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO site_ads (id, heading, tagline, link_url, image_urls, video_url, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, heading, tagline || null, link_url, JSON.stringify(image_urls || []), video_url || null,
     is_active === false ? 0 : 1, Number(sort_order || 0)]
  );
  res.json({ id });
});

// Admin: update
router.put("/:id", requireAdmin, async (req, res) => {
  const { heading, tagline, link_url, image_urls, video_url, is_active, sort_order } = req.body || {};
  await pool.query(
    `UPDATE site_ads SET heading=?, tagline=?, link_url=?, image_urls=?, video_url=?, is_active=?, sort_order=?
     WHERE id=?`,
    [heading, tagline || null, link_url, JSON.stringify(image_urls || []), video_url || null,
     is_active ? 1 : 0, Number(sort_order || 0), req.params.id]
  );
  res.json({ ok: true });
});

// Admin: delete
router.delete("/:id", requireAdmin, async (req, res) => {
  await pool.query(`DELETE FROM site_ads WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
});

function safeJson(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

module.exports = router;
