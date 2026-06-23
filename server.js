const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();

app.set("trust proxy", 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const ADS_DIR = path.join(UPLOAD_DIR, "ads");

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(ADS_DIR)) fs.mkdirSync(ADS_DIR, { recursive: true });

app.use("/files/ads", express.static(ADS_DIR, { maxAge: "7d", immutable: false }));

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    time: new Date().toISOString(),
  });
});

function mountRoute(routePath, basePath) {
  try {
    const router = require(routePath);
    app.use(basePath, router);
    console.log(`Loaded route: ${basePath}`);
  } catch (err) {
    console.error(`Failed to load route ${basePath}:`, err.message);
  }
}

mountRoute("./routes/admin-auth", "/api/admin");
mountRoute("./routes/ads", "/api/ads");
mountRoute("./routes/transfers", "/api/transfers");
mountRoute("./routes/visitors", "/api/visitors");

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

const port = Number(process.env.PORT || 3000);

app.listen(port, "0.0.0.0", () => {
  console.log(`V Move You backend running on :${port}`);
});
