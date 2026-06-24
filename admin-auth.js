const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { pool } = require("./db");
const { signAdminToken, requireAdmin } = require("../auth");

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
});

router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    const [rows] = await pool.query(
      "SELECT id, email, password_hash FROM admins WHERE email = ? LIMIT 1",
      [email]
    );

    const admin = rows[0];
    if (!admin) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = signAdminToken(admin);
    return res.json({ token, admin: { id: admin.id, email: admin.email } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
});

router.get("/me", requireAdmin, (req, res) => {
  res.json({ id: req.admin.sub, email: req.admin.email, role: "admin" });
});

module.exports = router;
