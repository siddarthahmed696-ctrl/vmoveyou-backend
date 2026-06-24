require("dotenv").config();

const express = require("express");
const path = require("path");

const corsMiddleware = require("./middleware/cors");
const errorHandler = require("./middleware/errorHandler");
const { UPLOAD_DIR, ADS_DIR } = require("./config/storage");

const app = express();

/**
 * Hostinger / proxy support
 * Important for rate-limit, IP, HTTPS proxy
 */
app.set("trust proxy", 1);

/**
 * CORS must come before all routes
 */
app.use(corsMiddleware);

/**
 * Body parser
 */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/**
 * Health check
 */
app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "vmoveyou-backend",
    time: new Date().toISOString(),
  });
});

/**
 * Optional: check upload directory from browser
 * Isse pata chalega server uploads folder access kar pa raha hai ya nahi
 */
app.get("/api/storage-check", (_req, res) => {
  const fs = require("fs");

  res.json({
    ok: true,
    uploadDir: UPLOAD_DIR,
    uploadDirExists: fs.existsSync(UPLOAD_DIR),
    adsDir: ADS_DIR,
    adsDirExists: fs.existsSync(ADS_DIR),
  });
});

/**
 * Static ad files
 */
app.use(
  "/files/ads",
  express.static(ADS_DIR, {
    maxAge: "7d",
    immutable: false,
  })
);

/**
 * API routes
 * Ye path important hai:
 * Download URL should look like:
 * /api/transfers/by-code/:code/file/:fileId
 */
app.use("/api/transfers", require("./routes/transfers"));
app.use("/api/ads", require("./routes/ads"));
app.use("/api/visitors", require("./routes/visitors"));
app.use("/api/admin", require("./routes/admin"));

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    method: req.method,
    path: req.originalUrl,
  });
});

/**
 * Error handler should be last
 */
app.use(errorHandler);

/**
 * Hostinger usually provides process.env.PORT.
 * Do not hardcode only 3000.
 */
const PORT = Number(process.env.PORT || 3000);

app.listen(PORT, () => {
  console.log(`V Move You backend running on port ${PORT}`);
  console.log(`Upload directory: ${UPLOAD_DIR}`);
});
