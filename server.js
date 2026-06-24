require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();

const origins = (process.env.CORS_ORIGIN || "").split(",").map((s) => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (origins.length === 0 || origins.includes(origin)) return cb(null, true);
    return cb(new Error("CORS blocked"));
  },
  credentials: false,
}));

app.use(express.json({ limit: "1mb" }));

// Static serving for ad images (kept under /files/ads/*)
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use("/files/ads", express.static(path.join(UPLOAD_DIR, "ads"), { maxAge: "7d", immutable: false }));

app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use("/api/admin", require("./routes/admin-auth"));
app.use("/api/ads", require("./routes/ads"));
app.use("/api/transfers", require("./routes/transfers"));
app.use("/api/visitors", require("./routes/visitors"));

app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`V Move You backend running on :${port}`));
