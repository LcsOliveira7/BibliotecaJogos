/* Carrega as variáveis de ambiente do arquivo .env.
Assim, podemos acessar configurações como DB_HOST e DB_PASSWORD
usando process.env, sem escrever os dados diretamente no código.
 */
require("dotenv").config();

/* mysql2: permite que o Node.js se conecte ao MySQL e execute SQL.
fs: permite ler arquivos do computador, como o certificado SSL.
path: ajuda a montar caminhos de arquivos corretamente.
 */
const mysql = require("mysql2");
const fs = require("fs");
const path = require("path");

/*Cria a conexão com o banco de dados.*/
const db = mysql.createConnection({
    // Endereço do servidor MySQL fornecido pelo Aiven.
    host: process.env.DB_HOST,
    // Porta de acesso ao MySQL. Number converte o texto em número.
    port: Number(process.env.DB_PORT),
    // Nome do usuário autorizado a acessar o banco.
    user: process.env.DB_USER,
    // Senha desse usuário, carregada do arquivo .env.
    password: process.env.DB_PASSWORD,
    // Nome do banco de dados que contém as tabelas do projeto.
    database: process.env.DB_NAME,

    /*
     * Configura a conexão SSL/TLS.
     * O certificado CA permite verificar a identidade do servidor.
     */
    ssl: {

        /*
         * Lê o certificado CA do arquivo indicado no .env.
         *
         * __dirname representa a pasta onde este db.js está.
         * path.resolve monta o caminho completo do certificado.
         * fs.readFileSync lê o arquivo para que o mysql2 possa usá-lo.
         */
        ca: fs.readFileSync(
            path.resolve(__dirname, process.env.DB_SSL_CA_PATH)
        )
    }
});

/*Tenta estabelecer a conexão com o banco.*/
db.connect((erro) => {

    // Verifica se ocorreu algum problema na conexão.
    if (erro) {

        // Mostra o erro para ajudar a identificar a causa.
        console.error("Erro ao conectar ao Aiven:", erro.message);

        // Encerra esta função sem executar a mensagem de sucesso.
        return;
    }

    // Executado quando a conexão é estabelecida com sucesso.
    console.log("Conectado ao MySQL do Aiven!");
});

/*Exporta a conexão para outros arquivos do projeto.*/
module.exports = db;