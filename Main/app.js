const express = require("express")
const app = express()
const db = require("./db")
const path = require("path")
const { error } = require("console")
const bcrypt = require("bcrypt");
require("dotenv").config();
const session = require("express-session");
const crypto = require("crypto");
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

function verificarCodigoConvite(codigo) {
    const codigoCorreto = process.env.ADMIN_INVITE_CODE;

    if (!codigoCorreto || !codigo) {
        return false;
    }

    const recebido = Buffer.from(codigo);
    const esperado = Buffer.from(codigoCorreto);

    if (recebido.length !== esperado.length) {
        return false;
    }

    return crypto.timingSafeEqual(recebido, esperado);
}

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
        const email = (req.body.email || "").trim().toLowerCase();
        const senha = req.body.senha || "";

        if (!email || !senha) {
            return res.status(400).send("Preencha todos os campos.");
        }

        // Consulta as duas tabelas
        const [administradores, usuarios] = await Promise.all([
            db.query(
                "SELECT * FROM administradores WHERE adminEmail = ?",
                [email]
            ),
            db.query(
                "SELECT * FROM usuarios WHERE usuarioEmail = ?",
                [email]
            )
        ]);

        // Evita conflito de contas
        if (administradores.length > 0 && usuarios.length > 0) {
            return res.status(409).send(
                "E-mail cadastrado em duas categorias. Verifique o banco."
            );
        }

        let conta;
        let tipo;

        if (administradores.length > 0) {
            conta = administradores[0];
            tipo = "admin";
        } else if (usuarios.length > 0) {
            conta = usuarios[0];
            tipo = "usuario";
        } else {
            return res.status(401).send("E-mail ou senha incorretos.");
        }

        // Identifica os campos de acordo com a tabela
        const senhaHash = tipo === "admin"? conta.adminSenha: conta.usuarioSenha;

        const senhaCorreta = await bcrypt.compare(senha, senhaHash);

        if (!senhaCorreta) {
            return res.status(401).send("E-mail ou senha incorretos.");
        }

        // Cria uma nova sessão
        req.session.regenerate((erro) => {
            if (erro) {
                console.log("Erro ao criar sessão:", erro.message);
                return res.status(500).send("Erro ao iniciar sessão.");
            }

            // Salva os dados e o tipo da conta
            req.session.usuario = {
                id: tipo === "admin" ? conta.adminID : conta.usuarioID,
                nome: tipo === "admin" ? conta.adminNome : conta.usuarioNome,
                email: tipo === "admin" ? conta.adminEmail : conta.usuarioEmail,
                tipo: tipo
            };

            req.session.save((erro) => {
                if (erro) {
                    console.log("Erro ao salvar sessão:", erro.message);
                    return res.status(500).send("Erro ao salvar sessão.");
                }

                res.redirect("/");
            });
        });

    } catch (erro) {
        console.log("Erro no login:", erro.message);
        res.status(500).send("Erro ao realizar login.");
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

app.get("/cadastro-admin", (req, res) => {
    res.render("cadastro-admin");
});

app.post("/cadastro-admin", async (req, res) => {
    try {
        const nome = (req.body.nome || "").trim();
        const email = (req.body.email || "").trim().toLowerCase();
        const senha = req.body.senha || "";
        const codigo = req.body.codigoConvite || "";

        // Verifica o código de convite
        if (!verificarCodigoConvite(codigo)) {
            return res.status(403).send("Código de convite inválido.");
        }

        // Verifica os campos
        if (!nome || !email || senha.length < 8) {
            return res.status(400).send(
                "Preencha todos os campos. A senha deve ter pelo menos 8 caracteres."
            );
        }

        // Verifica se o e-mail já existe em alguma das tabelas
        const [usuarios, administradores] = await Promise.all([
            db.query(
                "SELECT usuarioID FROM usuarios WHERE usuarioEmail = ?",
                [email]
            ),
            db.query(
                "SELECT adminID FROM administradores WHERE adminEmail = ?",
                [email]
            )
        ]);

        if (usuarios.length > 0 || administradores.length > 0) {
            return res.status(409).send("Este e-mail já está cadastrado.");
        }

        // Criptografa a senha
        const senhaCriptografada = await bcrypt.hash(senha, 10);

        // Cadastra o administrador
        await db.query(`
            INSERT INTO administradores
            (adminNome, adminEmail, adminSenha)
            VALUES (?, ?, ?)
        `, [nome, email, senhaCriptografada]);

        // Redireciona para o login
        res.redirect("/entrar");

    } catch (erro) {
        console.log("Erro ao cadastrar administrador:", erro.message);
        res.status(500).send("Erro ao cadastrar administrador.");
    }
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

