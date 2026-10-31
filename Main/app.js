const express = require("express")
const app = express()
const db = require("./db")
const path = require("path")
const { error } = require("console")
const bcrypt = require("bcrypt");
require("dotenv").config();
const session = require("express-session");
const port = 3000

app.use(express.static('public'))
//Permite que o Express interprete os dados enviados por formulários HTML e os disponibilize em req.body.
app.use(express.urlencoded({ extended: true }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configura o gerenciamento das sessões
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,

    cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: 3600000
    }
}));

// Disponibiliza as informações do usuário para as páginas EJS
app.use((req, res, next) => {

    // Verifica se há um usuário autenticado na sessão
    res.locals.usuarioLogado = req.session.usuario || null;

    // Continua para a próxima função ou rota
    next();
});

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

app.post("/cadastrar", async (req, res) => {
    try {

        // Recebe as informações enviadas pelo formulário
        const nome = (req.body.nome || "").trim(); // tira os espaços em brancos do inicio e final da mensagem
        const email = (req.body.email || "").trim().toLowerCase();
        const senha = req.body.senha || "";

        // Verifica se os dados foram preenchidos corretamente
        if (!nome || !email || senha.length < 8) {
            return res.status(400).send(
                "Preencha os campos e utilize uma senha com pelo menos 8 caracteres."
            );
        }

        // Transforma a senha original em um hash
        const senhaCriptografada = await bcrypt.hash(senha, 10);

        // Cadastra as informações no banco de dados
        await db.query(`
            insert into usuarios
            (usuarioNome, usuarioEmail, usuarioSenha)
            values (?, ?, ?)
        `, [nome, email, senhaCriptografada]);

        // Se o cadastro funcionar, redireciona para o login
        res.redirect("/entrar");

    } catch (erro) {

        // Verifica se o nome ou e-mail já está cadastrado
        if (erro.code === "ER_DUP_ENTRY") {
            return res.status(409).send(
                "Nome de usuário ou e-mail já cadastrado."
            );
        }

        // Mostra outros erros no terminal
        console.log("Erro ao cadastrar:", erro.message);

        res.status(500).send("Erro ao cadastrar usuário.");
    }
});

app.post("/login", async (req, res) => {
    try {

        // Recebe o e-mail e a senha enviados pelo formulário
        const email = (req.body.email || "").trim().toLowerCase();
        const senha = req.body.senha || "";

        // Verifica se os campos foram preenchidos
        if (!email || !senha) {
            return res.status(400).send("Preencha todos os campos.");
        }

        // Busca no banco o usuário que possui esse e-mail
        const usuarios = await db.query(
            "select * from usuarios where usuarioEmail = ?",
            [email]
        );

        // Verifica se o usuário foi encontrado
        if (usuarios.length === 0) {
            return res.status(401).send("E-mail ou senha incorretos.");
        }

        // Pega o primeiro usuário encontrado
        const usuario = usuarios[0];

        // Compara a senha digitada com o hash salvo no banco
        const senhaCorreta = await bcrypt.compare(
            senha,
            usuario.usuarioSenha
        );

        // Verifica se a senha está incorreta
        if (!senhaCorreta) {
            return res.status(401).send("E-mail ou senha incorretos.");
        }

        // Gera uma nova sessão para o usuário
        req.session.regenerate((erro) => {

            // Verifica se ocorreu algum erro ao criar a sessão
            if (erro) {
                console.log("Erro ao criar sessão:", erro.message);
                return res.status(500).send("Erro ao iniciar sessão.");
            }

            // Armazena as informações do usuário dentro da sessão
            req.session.usuario = {
                id: usuario.usuarioID,
                email: usuario.usuarioEmail
            };

            // Salva a sessão antes de mudar de página
            req.session.save((erro) => {

                // Verifica se ocorreu algum erro ao salvar a sessão
                if (erro) {
                    console.log("Erro ao salvar sessão:", erro.message);
                    return res.status(500).send("Erro ao salvar sessão.");
                }

                // Redireciona o usuário para a página inicial
                res.redirect("/");
            });
        });

    } catch (erro) {

        console.log("Erro no login:", erro.message);
        res.status(500).send("Erro ao realizar o login.");

    }
});


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


// Rota responsável por encerrar a sessão do usuário
app.post("/sair", (req, res) => {

    // Destrói a sessão armazenada no servidor
    req.session.destroy((erro) => {

        if (erro) {
            console.log("Erro ao sair:", erro.message);
            return res.status(500).send("Erro ao sair da conta.");
        }

        // Remove o cookie que identifica a sessão
        res.clearCookie("connect.sid");

        // Redireciona para a página de login
        res.redirect("/entrar");
    });
});


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

