-- V Move You — MySQL schema for Hostinger Business hosting
-- Run once: `npm run init-db` (or paste into phpMyAdmin)

CREATE TABLE IF NOT EXISTS admins (
  id            CHAR(36)     NOT NULL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS transfers (
  id              CHAR(36)     NOT NULL PRIMARY KEY,
  share_code      VARCHAR(32)  NOT NULL UNIQUE,
  title           VARCHAR(255) NULL,
  message         TEXT         NULL,
  sender_email    VARCHAR(255) NULL,
  recipient_email VARCHAR(255) NULL,
  total_size      BIGINT       NOT NULL DEFAULT 0,
  download_count  INT          NOT NULL DEFAULT 0,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      TIMESTAMP    NOT NULL,
  INDEX idx_transfers_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS transfer_files (
  id           CHAR(36)     NOT NULL PRIMARY KEY,
  transfer_id  CHAR(36)     NOT NULL,
  file_name    VARCHAR(512) NOT NULL,
  file_size    BIGINT       NOT NULL,
  content_type VARCHAR(255) NULL,
  storage_path VARCHAR(1024) NOT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_files_transfer (transfer_id),
  CONSTRAINT fk_files_transfer FOREIGN KEY (transfer_id) REFERENCES transfers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS site_ads (
  id          CHAR(36)     NOT NULL PRIMARY KEY,
  heading     VARCHAR(255) NOT NULL,
  tagline     TEXT         NULL,
  link_url    TEXT         NOT NULL,
  image_urls  JSON         NOT NULL,
  video_url   TEXT         NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  sort_order  INT          NOT NULL DEFAULT 0,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ads_active (is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS visitors (
  session_id VARCHAR(128) NOT NULL PRIMARY KEY,
  path       VARCHAR(512) NULL,
  last_seen  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_visitors_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
