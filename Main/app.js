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

// Armazenamento temporário de usuários
const usuariosMemoria = [];

// Armazenamento temporário de administradores
const administradoresMemoria = [];

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

// Verifica se o usuário está autenticado
function exigirLogin(req, res, next) {
    if (!req.session.usuario) {
        return res.redirect("/entrar");
    }

    next();
}

// Verifica se o usuário é administrador
function exigirAdmin(req, res, next) {
    if (!req.session.usuario) {
        return res.redirect("/entrar");
    }

    if (req.session.usuario.tipo !== "admin") {
        return res.status(403).send("Acesso permitido apenas para administradores.");
    }

    next();
}

// Painel de recomendações (somente administradores)
app.get("/admin/recomendacoes", exigirAdmin, (req, res) => {
    res.render("admin-recomendacoes", {recomendacoes: recomendacoes});
});

// Aprovar uma recomendação
app.post("/admin/recomendacoes/:id/aprovar", exigirAdmin, (req, res) => {

    const id = Number(req.params.id);

    const recomendacao = recomendacoes.find(item => item.id === id);

    if (!recomendacao) {
        return res.status(404).send("Recomendação não encontrada.");
    }

    recomendacao.status = "aprovada";

    res.redirect("/admin/recomendacoes");
});

// Recusar uma recomendação
app.post("/admin/recomendacoes/:id/recusar", exigirAdmin, (req, res) => {

    const id = Number(req.params.id);

    const recomendacao = recomendacoes.find(item => item.id === id);

    if (!recomendacao) {
        return res.status(404).send("Recomendação não encontrada.");
    }

    recomendacao.status = "recusada";

    res.redirect("/admin/recomendacoes");
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
        const nome = (req.body.nome || "").trim();
        const email = (req.body.email || "").trim().toLowerCase();
        const senha = req.body.senha || "";

        if (!nome || !email || senha.length < 8) {
            return res.status(400).send(
                "Preencha os campos e utilize uma senha com pelo menos 8 caracteres."
            );
        }

        // Verifica se o e-mail já está cadastrado
        const emailExiste = [...usuariosMemoria, ...administradoresMemoria]
            .some(conta => conta.email === email);

        if (emailExiste) {
            return res.status(409).send("Este e-mail já está cadastrado.");
        }

        // Criptografa a senha
        const senhaCriptografada = await bcrypt.hash(senha, 10);

        // Cria o novo usuário
        const novoUsuario = {
            id: Date.now(),
            nome: nome,
            email: email,
            senha: senhaCriptografada
        };

        // Armazena na memória
        usuariosMemoria.push(novoUsuario);

        console.log("Usuário cadastrado:", novoUsuario.nome);

        res.redirect("/entrar");

    } catch (erro) {
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

        // Procura a conta nas duas listas
        const admin = administradoresMemoria.find(
            conta => conta.email === email
        );

        const usuario = usuariosMemoria.find(
            conta => conta.email === email
        );

        const conta = admin || usuario;

        if (!conta) {
            return res.status(401).send("E-mail ou senha incorretos.");
        }

        // Compara a senha digitada com o hash armazenado
        const senhaCorreta = await bcrypt.compare(senha, conta.senha);

        if (!senhaCorreta) {
            return res.status(401).send("E-mail ou senha incorretos.");
        }

        // Cria uma nova sessão
        req.session.regenerate((erro) => {
            if (erro) {
                return res.status(500).send("Erro ao iniciar sessão.");
            }

            req.session.usuario = {
                id: conta.id,
                nome: conta.nome,
                email: conta.email,
                tipo: admin ? "admin" : "usuario"
            };

            req.session.save((erro) => {
                if (erro) {
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

app.get("/recomendar", exigirLogin, (req, res) => {
    res.render("recomendar")
})

app.post("/recomendar", exigirLogin, (req, res) => {

    const { nome, desc, img, link } = req.body;

    if (!nome || !desc || !img || !link) {
        return res.status(400).send("Preencha todos os campos.");
    }

    const novaRecomendacao = {
        id: Date.now(),
        nome: nome.trim(),
        descricao: desc.trim(),
        imagem: img.trim(),
        link: link.trim(),
        usuario: req.session.usuario.nome,
        status: "pendente"
    };

    recomendacoes.push(novaRecomendacao);

    res.redirect("/recomendado");
});

app.get("/recomendado", exigirLogin, (req, res) => {
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

        if (!nome || !email || senha.length < 8) {
            return res.status(400).send(
                "Preencha todos os campos. A senha deve ter pelo menos 8 caracteres."
            );
        }

        // Verifica se o e-mail já existe
        const emailExiste = [...usuariosMemoria, ...administradoresMemoria]
            .some(conta => conta.email === email);

        if (emailExiste) {
            return res.status(409).send("Este e-mail já está cadastrado.");
        }

        const senhaCriptografada = await bcrypt.hash(senha, 10);

        const novoAdmin = {
            id: Date.now(),
            nome: nome,
            email: email,
            senha: senhaCriptografada
        };

        administradoresMemoria.push(novoAdmin);

        console.log("Administrador cadastrado:", novoAdmin.nome);

        res.redirect("/entrar");

    } catch (erro) {
        console.log("Erro ao cadastrar administrador:", erro.message);
        res.status(500).send("Erro ao cadastrar administrador.");
    }
});



// Função responsável por testar o banco e iniciar o servidor
/*async function iniciarServidor() {
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

iniciarServidor(); */

app.listen(port, () => {
    console.log("Servidor rodando na porta", port);
    console.log("A conexão com o banco será necessária apenas nas rotas que utilizam o MySQL.");
});

