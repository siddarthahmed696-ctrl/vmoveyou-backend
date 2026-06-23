const express = require("express");
const { pool } = require("../db");
const { requireAdmin } = require("../auth");

const router = express.Router();

// Public heartbeat
router.post("/heartbeat", async (req, res) => {
  const { session_id, path: pagePath } = req.body || {};
  if (!session_id || session_id.length < 8 || session_id.length > 128) {
    return res.status(400).json({ error: "invalid session_id" });
  }
  const safePath = (pagePath || "").toString().slice(0, 512);
  await pool.query(
    `INSERT INTO visitors (session_id, path) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE path = VALUES(path), last_seen = CURRENT_TIMESTAMP`,
    [session_id, safePath]
  );
  res.json({ ok: true });
});

// Admin: live visitor count (last 90s)
router.get("/live", requireAdmin, async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS n FROM visitors WHERE last_seen > (NOW() - INTERVAL 90 SECOND)`
  );
  res.json({ count: Number(rows[0].n) });
});

module.exports = router;
