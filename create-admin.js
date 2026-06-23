// Create an admin user:  node scripts/create-admin.js admin@example.com SuperSecret123
require("dotenv").config();
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

(async () => {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error("Usage: node scripts/create-admin.js <email> <password>");
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await conn.query(
    `INSERT INTO admins (id, email, password_hash) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)`,
    [crypto.randomUUID(), email, hash]
  );
  await conn.end();
  console.log(`✅ Admin ready: ${email}`);
})().catch((e) => { console.error(e); process.exit(1); });
