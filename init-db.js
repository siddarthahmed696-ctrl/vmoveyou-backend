// Run once to create all tables: `node scripts/init-db.js`
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });
  await conn.query(sql);
  await conn.end();
  console.log("✅ Database initialised");
})().catch((e) => { console.error(e); process.exit(1); });
