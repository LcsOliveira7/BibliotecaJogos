const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

let sslConfig = { rejectUnauthorized: true };
const caPath = path.join(__dirname, 'ca.pem');

if (fs.existsSync(caPath)) {
    sslConfig.ca = fs.readFileSync(caPath, 'utf8');
}


const dbPassword = process.env.AIVEN_DB_PASSWORD; 

const pool = mysql.createPool({
    host: 'mysql-projeto-escola-mysql-projeto-escola.b.aivencloud.com',
    port: 13680,
    user: 'avnadmin',
    password: dbPassword, 
    database: 'defaultdb',
    ssl: sslConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 60000,
    enableKeepAlive: true
});

async function query(sql, params) {
    let connection;
    try {
        connection = await pool.getConnection();
        const [results] = await connection.query(sql, params);
        return results;
    } catch (error) {
        console.error('Erro na query do banco de dados:', error.message);
        throw error;
    } finally {
        if (connection) connection.release();
    }
}

// Exportamos a função query E o pool para permitir transações no app.js
module.exports = { query, pool };
