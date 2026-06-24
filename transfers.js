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

// IMPORTANT on Hostinger: better set absolute UPLOAD_DIR in .env
// Example: UPLOAD_DIR=/home/u123456789/domains/backend.vmoveyou.com/vmoveyou-backend/uploads
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

const downloadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
});

function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function safeFileName(name) {
  return String(name || "download").replace(/[\r\n"]/g, "_");
}

function contentDisposition(fileName) {
  const safe = safeFileName(fileName);
  const ascii = safe.replace(/[^\x20-\x7E]/g, "_");
  const encoded = encodeURIComponent(safe).replace(/[!'()*]/g, (c) =>
    `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );

  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function getSafeFilePath(storagePath) {
  if (!storagePath) return null;

  const uploadRoot = path.resolve(UPLOAD_DIR);
  const resolved = path.resolve(uploadRoot, storagePath);

  // Prevent path traversal
  if (!resolved.startsWith(uploadRoot + path.sep) && resolved !== uploadRoot) {
    return null;
  }

  return resolved;
}

function parseRangeHeader(rangeHeader, totalSize) {
  if (!rangeHeader) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) return { invalid: true };

  let start;
  let end;

  const startText = match[1];
  const endText = match[2];

  // bytes=-500 => last 500 bytes
  if (startText === "" && endText !== "") {
    const suffixLength = Number(endText);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
      return { invalid: true };
    }

    start = Math.max(totalSize - suffixLength, 0);
    end = totalSize - 1;
  } else {
    start = startText === "" ? 0 : Number(startText);
    end = endText === "" ? totalSize - 1 : Number(endText);
  }

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    end < 0 ||
    start > end ||
    start >= totalSize
  ) {
    return { invalid: true };
  }

  end = Math.min(end, totalSize - 1);

  return { start, end };
}

// Per-transfer disk storage
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const transferId = req.params.id;
    const dir = path.join(UPLOAD_DIR, transferId);

    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },

  filename: (_req, file, cb) => {
    const original = file.originalname || "file";
    const safe = original.replace(/[^\w.\-]+/g, "_");
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_BYTES,
    files: 50,
  },
});

function uploadFilesMiddleware(req, res, next) {
  upload.array("files", 50)(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
          error: `Free transfers are limited to ${MAX_MB} MB`,
        });
      }

      return res.status(400).json({
        error: err.message || "Upload error",
      });
    }

    return next(err);
  });
}

// ── Create transfer
router.post(
  "/",
  createLimiter,
  asyncHandler(async (req, res) => {
    const {
      title,
      message,
      sender_email,
      recipient_email,
      total_size,
    } = req.body || {};

    const size = Number(total_size || 0);

    if (!Number.isFinite(size) || size < 0 || size > MAX_BYTES) {
      return res.status(413).json({
        error: `Free transfers are limited to ${MAX_MB} MB`,
      });
    }

    const id = crypto.randomUUID();
    const shareCode = crypto.randomBytes(8).toString("hex");
    const expiresAt = new Date(Date.now() + EXPIRY_DAYS * 86400 * 1000);

    await pool.query(
      `INSERT INTO transfers
        (id, share_code, title, message, sender_email, recipient_email, total_size, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        shareCode,
        title || null,
        message || null,
        sender_email || null,
        recipient_email || null,
        size,
        expiresAt,
      ]
    );

    return res.json({
      id,
      share_code: shareCode,
    });
  })
);

// ── Upload file(s) into transfer
router.post(
  "/:id/files",
  uploadFilesMiddleware,
  asyncHandler(async (req, res) => {
    const transferId = req.params.id;

    const [transferRows] = await pool.query(
      "SELECT id, total_size FROM transfers WHERE id = ? LIMIT 1",
      [transferId]
    );

    if (!transferRows[0]) {
      return res.status(404).json({
        error: "Transfer not found",
      });
    }

    const files = req.files || [];
    const totalNew = files.reduce((sum, file) => sum + Number(file.size || 0), 0);

    if (totalNew > MAX_BYTES) {
      return res.status(413).json({
        error: `Free transfers are limited to ${MAX_MB} MB`,
      });
    }

    const inserts = files.map((file) => [
      crypto.randomUUID(),
      transferId,
      file.originalname || "file",
      file.size,
      file.mimetype || "application/octet-stream",
      path.relative(UPLOAD_DIR, file.path),
    ]);

    if (inserts.length > 0) {
      await pool.query(
        `INSERT INTO transfer_files
          (id, transfer_id, file_name, file_size, content_type, storage_path)
         VALUES ?`,
        [inserts]
      );
    }

    return res.json({
      ok: true,
      count: inserts.length,
    });
  })
);

// ── Public lookup by share code
router.get(
  "/by-code/:code",
  asyncHandler(async (req, res) => {
    const code = req.params.code;

    const [transferRows] = await pool.query(
      `SELECT
          id,
          share_code,
          title,
          message,
          sender_email,
          total_size,
          download_count,
          created_at,
          expires_at
       FROM transfers
       WHERE share_code = ?
       LIMIT 1`,
      [code]
    );

    const transfer = transferRows[0];

    if (!transfer) {
      return res.status(404).json({
        error: "Not found",
      });
    }

    if (new Date(transfer.expires_at) < new Date()) {
      return res.status(410).json({
        error: "Expired",
      });
    }

    const [files] = await pool.query(
      `SELECT
          id,
          file_name,
          file_size,
          content_type
       FROM transfer_files
       WHERE transfer_id = ?
       ORDER BY created_at`,
      [transfer.id]
    );

    return res.json({
      transfer,
      files,
    });
  })
);

async function handleDownload(req, res) {
  const { code, fileId } = req.params;

  const [rows] = await pool.query(
    `SELECT
        f.file_name,
        f.content_type,
        f.storage_path,
        f.file_size,
        t.expires_at,
        t.share_code
     FROM transfer_files f
     JOIN transfers t ON t.id = f.transfer_id
     WHERE f.id = ?
       AND t.share_code = ?
     LIMIT 1`,
    [fileId, code]
  );

  const row = rows[0];

  if (!row) {
    return res.status(404).json({
      error: "Not found",
    });
  }

  if (new Date(row.expires_at) < new Date()) {
    return res.status(410).json({
      error: "Expired",
    });
  }

  const filePath = getSafeFilePath(row.storage_path);

  if (!filePath) {
    return res.status(400).json({
      error: "Invalid file path",
    });
  }

  let stat;

  try {
    stat = fs.statSync(filePath);
  } catch (_err) {
    return res.status(404).json({
      error: "File missing",
    });
  }

  if (!stat.isFile()) {
    return res.status(404).json({
      error: "File missing",
    });
  }

  const totalSize = stat.size;
  const mime = row.content_type || "application/octet-stream";

  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Disposition", contentDisposition(row.file_name));
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("X-Content-Type-Options", "nosniff");

  // HEAD request: browser/download manager file size check karta hai
  if (req.method === "HEAD") {
    res.setHeader("Content-Length", String(totalSize));
    return res.status(200).end();
  }

  const rangeHeader = req.headers.range;
  const parsedRange = parseRangeHeader(rangeHeader, totalSize);

  let stream;
  let statusCode = 200;

  if (parsedRange && parsedRange.invalid) {
    res.setHeader("Content-Range", `bytes */${totalSize}`);
    return res.status(416).end();
  }

  if (parsedRange) {
    const { start, end } = parsedRange;
    const chunkSize = end - start + 1;

    statusCode = 206;

    res.status(statusCode);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);
    res.setHeader("Content-Length", String(chunkSize));

    stream = fs.createReadStream(filePath, { start, end });
  } else {
    res.status(statusCode);
    res.setHeader("Content-Length", String(totalSize));

    stream = fs.createReadStream(filePath);
  }

  // Count only actual GET download attempt
  pool
    .query("UPDATE transfers SET download_count = download_count + 1 WHERE share_code = ?", [code])
    .catch(() => {});

  stream.on("error", (err) => {
    console.error("Download stream error:", err);

    if (!res.headersSent) {
      return res.status(500).json({
        error: "Download failed",
      });
    }

    res.destroy(err);
  });

  return stream.pipe(res);
}

// ── Download a single file: HEAD + GET + Range support
router.head(
  "/by-code/:code/file/:fileId",
  asyncHandler(handleDownload)
);

router.get(
  "/by-code/:code/file/:fileId",
  downloadLimiter,
  asyncHandler(handleDownload)
);

module.exports = router;
