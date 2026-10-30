const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();


// Configura a segurança da conexão com o banco de dados
const sslConfig = {
    // Lê o certificado SSL (ca.pem) que está na mesma pasta do db.js
    ca: fs.readFileSync(
        path.join(__dirname, "ca.pem"),
        "utf8"
    ),
    // Exige que o certificado do servidor seja válido e confiável
    rejectUnauthorized: true
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
