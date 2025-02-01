const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER02,
    password: process.env.DB_PASSWORD02,
    host: process.env.DB_HOST02,
    port: process.env.DB_PORT02,
    database: process.env.DB_DATABASE02,
});

module.exports = pool;
