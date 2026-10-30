const express = require("express")
const app = express()
const db = require("./db")
const path = require("path")
const { error } = require("console")
const port = 3000

app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.get("/", (req, res) => {
    res.render("index")
})


app.get("/explorar", async (req, res) => {
    try {
        // Executa uma consulta SQL no Aiven e aguarda o resultado
        // O AS permite dar nomes alternativos às colunas retornadas
        const jogos = await db.query(`
            select
                jogoNome as nome,
                jogoDescricao as descricao,
                jogoImagem as imagem
            from jogos
        `);
        // Mostra no terminal os jogos encontrados no banco
        console.log("Jogos encontrados:", jogos);
        // Abre a página explorar.ejs e envia os jogos para ela
        res.render("explorar", { jogos: jogos });

    } catch (erro) {
        // Se ocorrer um erro, mostra a mensagem no terminal
        console.log("Erro ao buscar jogos:", erro.message);
        // Envia ao navegador o status 500 (erro interno do servidor)
        res.status(500).send("Erro ao carregar os jogos.");
    }
});


app.get("/cadastrar", (req, res) => {
    res.render("cadastrar")  
})

app.get("/entrar", (req, res) => {
    res.render("entrar")  
})

app.get("/recomendar", (req, res) => {
    res.render("recomendar")
})

app.post("/recomendar", (req, res) => {
    res.redirect("/recomendado")
})

app.get("/recomendado", (req, res) => {
    res.render("recomendado")
})

// Função responsável por testar o banco e iniciar o servidor
async function iniciarServidor() {
    try {

        // Executa uma consulta simples para verificar a conexão com o Aiven
        // O SELECT 1 retorna o número 1 e não precisa de nenhuma tabela
        const resultado = await db.query("SELECT 1 AS teste");

        // Se a consulta funcionar, mostra a confirmação no terminal
        console.log("Aiven conectado com sucesso!");
        console.log("Resultado do teste:", resultado[0].teste);
        // Inicia o servidor Express na porta definida
        app.listen(port, () => {
            console.log("Servidor rodando na porta", port);
        });

    } catch (erro) {
        // Se a consulta falhar, mostra o erro no terminal
        console.error("Erro ao conectar ao Aiven:", erro.message);
    }
}

iniciarServidor();

