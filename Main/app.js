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

app.get("/admin/recomendacoes", exigirAdmin, async (req, res) => {
    try {
        const recomendacoes = await db.query(`
        SELECT
            r.recomendacaoID AS id,
            r.recomendacaoTituloJogo AS nome,
            r.recomendacaoJustificativa AS descricao,
            r.recomendacaoImagem AS imagem,
            r.recomendacaoLink AS link,
            r.recomendacaoStatus AS status,
            u.usuarioNome AS usuario,
            GROUP_CONCAT(
                c.categoriaNome
                ORDER BY c.categoriaNome
                SEPARATOR ', '
            ) AS categorias

        FROM recomendacoes r

        INNER JOIN usuarios u
            ON r.usuarioID = u.usuarioID

        LEFT JOIN categoriaRecomendacao cr
            ON r.recomendacaoID = cr.recomendacaoID

        LEFT JOIN categorias c
            ON cr.categoriaID = c.categoriaID

        WHERE r.recomendacaoStatus = 'pendente'

        GROUP BY
            r.recomendacaoID,
            r.recomendacaoTituloJogo,
            r.recomendacaoJustificativa,
            r.recomendacaoImagem,
            r.recomendacaoLink,
            r.recomendacaoStatus,
            u.usuarioNome

        ORDER BY r.recomendacaoID DESC
    `);

        res.render("admin-recomendacoes", { recomendacoes });

    } catch (erro) {
        console.log("Erro ao buscar recomendações:", erro.message);
        res.status(500).send("Erro ao carregar as recomendações.");
    }
});


// Aprovar uma recomendação


app.post("/admin/recomendacoes/:id/aprovar", exigirAdmin, async (req, res) => {

    const id = Number(req.params.id);
    const adminID = req.session.usuario.id;

    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).send("ID inválido.");
    }

    let conexao;
    let transacaoIniciada = false;

    try {
        conexao = await db.pool.getConnection();

        await conexao.beginTransaction();
        transacaoIniciada = true;

        // Busca a recomendação e bloqueia sua alteração durante a aprovação
        const [resultado] = await conexao.execute(
            `SELECT
                recomendacaoTituloJogo,
                recomendacaoJustificativa,
                recomendacaoImagem,
                recomendacaoLink,
                recomendacaoDesenvolvedora,
                recomendacaoDataLancamento,
                recomendacaoStatus
             FROM recomendacoes
             WHERE recomendacaoID = ?
             FOR UPDATE`,
            [id]
        );

        if (resultado.length === 0) {
            await conexao.rollback();
            transacaoIniciada = false;
            return res.status(404).send("Recomendação não encontrada.");
        }

        const recomendacao = resultado[0];

        if (recomendacao.recomendacaoStatus !== "pendente") {
            await conexao.rollback();
            transacaoIniciada = false;
            return res.status(400).send("Esta recomendação já foi analisada.");
        }

        // Verifica se o administrador preencheu os dados obrigatórios
        if (
            !recomendacao.recomendacaoDesenvolvedora?.trim() ||
            !recomendacao.recomendacaoDataLancamento
        ) {
            await conexao.rollback();
            transacaoIniciada = false;

            return res.status(400).send(
                "Preencha a desenvolvedora e a data de lançamento antes de aprovar."
            );
        }

        // Busca as categorias da recomendação
        const [categorias] = await conexao.execute(
            `SELECT categoriaID
             FROM categoriaRecomendacao
             WHERE recomendacaoID = ?`,
            [id]
        );

        if (categorias.length === 0) {
            await conexao.rollback();
            transacaoIniciada = false;
            return res.status(400).send("A recomendação precisa ter pelo menos uma categoria.");
        }

        const [jogoExistente] = await conexao.execute(
            `SELECT jogoID
            FROM jogos
            WHERE jogoNome = ?`,
            [recomendacao.recomendacaoTituloJogo]
        );

        if (jogoExistente.length > 0) {
            await conexao.rollback();
            transacaoIniciada = false;

            return res.status(400).send(
                "Este jogo já está cadastrado na biblioteca."
            );
        }

        // Cadastra o jogo oficialmente
        const [novoJogo] = await conexao.execute(
            `INSERT INTO jogos
            (
                jogoNome,
                jogoDescricao,
                jogoDesenvolvedora,
                jogoDataLancamento,
                jogoImagem,
                jogoLink,
                adminID
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                recomendacao.recomendacaoTituloJogo,
                recomendacao.recomendacaoJustificativa,
                recomendacao.recomendacaoDesenvolvedora,
                recomendacao.recomendacaoDataLancamento,
                recomendacao.recomendacaoImagem,
                recomendacao.recomendacaoLink,
                adminID
            ]
        );

        const jogoID = novoJogo.insertId;

        // Copia as categorias para o jogo oficial
        for (const categoria of categorias) {
            await conexao.execute(
                `INSERT INTO categoriaJogo (jogoID, categoriaID)
                 VALUES (?, ?)`,
                [jogoID, categoria.categoriaID]
            );
        }

        // Atualiza o status da recomendação
        await conexao.execute(
            `UPDATE recomendacoes
             SET recomendacaoStatus = 'aprovada'
             WHERE recomendacaoID = ?`,
            [id]
        );

        await conexao.commit();
        transacaoIniciada = false;

        res.redirect("/admin/recomendacoes");

    } catch (erro) {

        if (conexao && transacaoIniciada) {
            await conexao.rollback();
        }

        console.log("Erro ao aprovar recomendação:", erro.message);
        res.status(500).send("Erro ao cadastrar o jogo na biblioteca.");

    } finally {
        if (conexao) {
            conexao.release();
        }
    }
});




app.get("/admin/recomendacoes/:id/editar", exigirAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).send("ID de recomendação inválido.");
        }

        // Busca os dados da recomendação
        const resultado = await db.query(`
            SELECT
                recomendacaoID AS id,
                recomendacaoTituloJogo AS nome,
                recomendacaoJustificativa AS descricao,
                recomendacaoImagem AS imagem,
                recomendacaoLink AS link,
                recomendacaoDesenvolvedora AS desenvolvedora,
                recomendacaoDataLancamento AS dataLancamento
            FROM recomendacoes
            WHERE recomendacaoID = ?
        `, [id]);

        if (resultado.length === 0) {
            return res.status(404).send("Recomendação não encontrada.");
        }

        const recomendacao = resultado[0];

        // Busca todas as categorias disponíveis
        const categorias = await db.query(`
            SELECT categoriaID, categoriaNome
            FROM categorias
            ORDER BY categoriaNome
        `);

        // Busca as categorias já associadas à recomendação
        const categoriasSelecionadas = await db.query(`
            SELECT categoriaID
            FROM categoriaRecomendacao
            WHERE recomendacaoID = ?
        `, [id]);

        recomendacao.categoriasIDs = categoriasSelecionadas.map(
            categoria => Number(categoria.categoriaID)
        );

        res.render("editar-recomendacao", {
            recomendacao,
            categorias
        });

    } catch (erro) {
        console.log("Erro ao carregar edição:", erro.message);
        res.status(500).send("Erro ao carregar a página de edição.");
    }
});



app.post("/admin/recomendacoes/:id/recusar", exigirAdmin, async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).send("ID inválido.");
        }

        const resultado = await db.query(
            `UPDATE recomendacoes
             SET recomendacaoStatus = 'recusada'
             WHERE recomendacaoID = ?
             AND recomendacaoStatus = 'pendente'`,
            [id]
        );

        if (resultado.affectedRows === 0) {
            return res.status(404).send(
                "Recomendação não encontrada ou já analisada."
            );
        }

        res.redirect("/admin/recomendacoes");

    } catch (erro) {
        console.log("Erro ao recusar recomendação:", erro.message);
        res.status(500).send("Erro ao recusar recomendação.");
    }
});




app.post("/admin/recomendacoes/:id/editar", exigirAdmin, async (req, res) => {

    const id = Number(req.params.id);
    const {
        nome,
        desc,
        img,
        link,
        desenvolvedora,
        dataLancamento
    } = req.body;

    // Recebe e organiza as categorias selecionadas
    const categoriasRecebidas = req.body.categorias;

    const categorias = [
        ...new Set(
            (Array.isArray(categoriasRecebidas)
                ? categoriasRecebidas
                : categoriasRecebidas ? [categoriasRecebidas] : []
            ).map(Number)
        )
    ];

    // Valida os dados recebidos
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).send("ID inválido.");
    }

    if (!nome?.trim() || !desc?.trim() || !img?.trim() || !link?.trim()) {
        return res.status(400).send("Preencha todos os campos.");
    }

    if (
        categorias.length === 0 ||
        categorias.some(categoriaID =>
            !Number.isInteger(categoriaID) || categoriaID <= 0
        )
    ) {
        return res.status(400).send("Selecione pelo menos uma categoria válida.");
    }

    let conexao;
    let transacaoIniciada = false;

    try {
        conexao = await db.pool.getConnection();

        // Verifica se a recomendação existe
        const [recomendacoesEncontradas] = await conexao.execute(
            "SELECT recomendacaoID FROM recomendacoes WHERE recomendacaoID = ?",
            [id]
        );

        if (recomendacoesEncontradas.length === 0) {
            return res.status(404).send("Recomendação não encontrada.");
        }

        const [statusRecomendacao] = await conexao.execute(
            `SELECT recomendacaoStatus 
            FROM recomendacoes
            WHERE recomendacaoID = ?`,
            [id]
        );

        if (statusRecomendacao[0].recomendacaoStatus !== "pendente") {
            return res.status(400).send(
                "Não é possível editar uma recomendação já analisada."
            );
        }

        // Verifica se todas as categorias existem
        const placeholders = categorias.map(() => "?").join(", ");

        const [categoriasValidas] = await conexao.execute(
            `SELECT categoriaID FROM categorias
             WHERE categoriaID IN (${placeholders})`,
            categorias
        );

        if (categoriasValidas.length !== categorias.length) {
            return res.status(400).send("Uma ou mais categorias são inválidas.");
        }

        await conexao.beginTransaction();
        transacaoIniciada = true;

        // Atualiza os dados da recomendação

        await conexao.execute(
            `UPDATE recomendacoes
            SET recomendacaoTituloJogo = ?,
                recomendacaoJustificativa = ?,
                recomendacaoImagem = ?,
                recomendacaoLink = ?,
                recomendacaoDesenvolvedora = ?,
                recomendacaoDataLancamento = ?
            WHERE recomendacaoID = ?`,
            [
                nome.trim(),
                desc.trim(),
                img.trim(),
                link.trim(),
                desenvolvedora?.trim() || null,
                dataLancamento || null,
                id
            ]
        );

        // Remove as categorias antigas
        await conexao.execute(
            "DELETE FROM categoriaRecomendacao WHERE recomendacaoID = ?",
            [id]
        );

        // Insere as novas categorias
        for (const categoriaID of categorias) {
            await conexao.execute(
                `INSERT INTO categoriaRecomendacao
                 (recomendacaoID, categoriaID)
                 VALUES (?, ?)`,
                [id, categoriaID]
            );
        }

        await conexao.commit();
        transacaoIniciada = false;

        res.redirect("/admin/recomendacoes");

    } catch (erro) {

        if (conexao && transacaoIniciada) {
            await conexao.rollback();
        }

        console.log("Erro ao editar recomendação:", erro.message);
        res.status(500).send("Erro ao salvar as alterações.");

    } finally {
        if (conexao) {
            conexao.release();
        }
    }
});



app.get("/", (req, res) => {
    res.render("index")
})


app.get("/explorar", async (req, res) => {
    try {
        const categoriaID = req.query.categoria;
        
        if (categoriaID !== undefined) {
            const id = Number(categoriaID);

            if (!Number.isInteger(id) || id <= 0) {
                return res.status(400).send("Categoria inválida.");
            }

            const categoriaExiste = await db.query(`
                SELECT categoriaID
                FROM categorias
                WHERE categoriaID = ?
            `, [id]);

            if (categoriaExiste.length === 0) {
                return res.status(404).send("Categoria não encontrada.");
            }
        }

        let sql = `
            SELECT DISTINCT
                j.jogoID AS id,
                j.jogoNome AS nome,
                j.jogoDescricao AS descricao,
                j.jogoImagem AS imagem
            FROM jogos j
        `;

        const valores = [];

        // Se uma categoria foi selecionada, filtra os jogos
        if (categoriaID) {
            sql += `
                INNER JOIN categoriaJogo cj
                    ON j.jogoID = cj.jogoID
                WHERE cj.categoriaID = ?
            `;

            valores.push(categoriaID);
        }

        sql += ` ORDER BY j.jogoNome ASC`;

        const jogos = await db.query(sql, valores);

        const categorias = await db.query(`
            SELECT categoriaID, categoriaNome
            FROM categorias
            ORDER BY categoriaNome ASC
        `);

        res.render("explorar", {
            jogos,
            categorias,
            categoriaSelecionada: categoriaID
        });

    } catch (erro) {
        console.log("Erro ao carregar exploração:", erro.message);
        res.status(500).send("Erro ao carregar a página de exploração.");
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

        // Verifica se o e-mail já existe nas duas tabelas
        const usuarios = await db.query(
            "SELECT usuarioID FROM usuarios WHERE usuarioEmail = ?",
            [email]
        );

        const admins = await db.query(
            "SELECT adminID FROM administradores WHERE adminEmail = ?",
            [email]
        );

        if (usuarios.length > 0 || admins.length > 0) {
            return res.status(409).send("Este e-mail já está cadastrado.");
        }

        // Criptografa a senha
        const senhaCriptografada = await bcrypt.hash(senha, 10);

        // Insere o usuário no MySQL
        await db.query(
            `INSERT INTO usuarios (usuarioNome, usuarioEmail, usuarioSenha)
             VALUES (?, ?, ?)`,
            [nome, email, senhaCriptografada]
        );

        console.log("Usuário cadastrado:", nome);

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

        // Procura o administrador no MySQL
        const admins = await db.query(
            "SELECT * FROM administradores WHERE adminEmail = ?",
            [email]
        );

        // Procura o usuário no MySQL
        const usuarios = await db.query(
            "SELECT * FROM usuarios WHERE usuarioEmail = ?",
            [email]
        );

        const admin = admins[0];
        const usuario = usuarios[0];

        const conta = admin || usuario;

        if (!conta) {
            return res.status(401).send("E-mail ou senha incorretos.");
        }

        const senhaArmazenada = admin
            ? admin.adminSenha
            : usuario.usuarioSenha;

        // Compara a senha digitada com o hash armazenado
        const senhaCorreta = await bcrypt.compare(
            senha,
            senhaArmazenada
        );

        if (!senhaCorreta) {
            return res.status(401).send("E-mail ou senha incorretos.");
        }

        // Cria uma nova sessão
        req.session.regenerate((erro) => {
            if (erro) {
                return res.status(500).send("Erro ao iniciar sessão.");
            }

            req.session.usuario = {
                id: admin ? admin.adminID : usuario.usuarioID,
                nome: admin ? admin.adminNome : usuario.usuarioNome,
                email: email,
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

app.get("/recomendar", exigirLogin, async (req, res) => {
    try {
        const categorias = await db.query(`
            SELECT categoriaID, categoriaNome
            FROM categorias
            ORDER BY categoriaNome
        `);

        res.render("recomendar", { categorias });

    } catch (erro) {
        console.log("Erro ao buscar categorias:", erro.message);
        res.status(500).send("Erro ao carregar as categorias.");
    }
});


app.post("/recomendar", exigirLogin, async (req, res) => {

    const { nome, desc, img, link } = req.body;

    // Recebe as categorias selecionadas
    const categoriasRecebidas = req.body.categorias;

    const categorias = [
        ...new Set(
            (Array.isArray(categoriasRecebidas)
                ? categoriasRecebidas
                : categoriasRecebidas ? [categoriasRecebidas] : []
            ).map(Number)
        )
    ];

    if (
        !nome?.trim() ||
        !desc?.trim() ||
        !img?.trim() ||
        !link?.trim()
    ) {
        return res.status(400).send("Preencha todos os campos.");
    }

    if (categorias.length === 0 ||
        categorias.some(id => !Number.isInteger(id) || id <= 0)) {
        return res.status(400).send("Selecione pelo menos uma categoria válida.");
    }

    let conexao;

    let transacaoIniciada = false;

    try {
        conexao = await db.pool.getConnection();

        // Verifica se as categorias realmente existem
        const placeholders = categorias.map(() => "?").join(", ");

        const [categoriasValidas] = await conexao.execute(
            `SELECT categoriaID FROM categorias
             WHERE categoriaID IN (${placeholders})`,
            categorias
        );

        if (categoriasValidas.length !== categorias.length) {
            return res.status(400).send("Uma ou mais categorias são inválidas.");
        }

        await conexao.beginTransaction();

        transacaoIniciada = true;

        // Cadastra a recomendação
        const [resultado] = await conexao.execute(
            `INSERT INTO recomendacoes
            (recomendacaoTituloJogo, recomendacaoJustificativa,
             recomendacaoImagem, recomendacaoLink, usuarioID)
            VALUES (?, ?, ?, ?, ?)`,
            [
                nome.trim(),
                desc.trim(),
                img.trim(),
                link.trim(),
                req.session.usuario.id
            ]
        );

        const recomendacaoID = resultado.insertId;

        // Relaciona a recomendação com cada categoria
        for (const categoriaID of categorias) {
            await conexao.execute(
                `INSERT INTO categoriaRecomendacao
                (recomendacaoID, categoriaID)
                VALUES (?, ?)`,
                [recomendacaoID, categoriaID]
            );
        }

        await conexao.commit();

        transacaoIniciada = false;

        res.redirect("/recomendado");

    } catch (erro) {

    if (conexao && transacaoIniciada) {
        await conexao.rollback();
    }

        console.log("Erro ao salvar recomendação:", erro.message);
        res.status(500).send("Erro ao enviar recomendação.");

    } finally {
        if (conexao) {
            conexao.release();
        }
    }
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
        const usuarios = await db.query(
            "SELECT usuarioID FROM usuarios WHERE usuarioEmail = ?",
            [email]
        );

        const admins = await db.query(
            "SELECT adminID FROM administradores WHERE adminEmail = ?",
            [email]
        );

        if (usuarios.length > 0 || admins.length > 0) {
            return res.status(409).send("Este e-mail já está cadastrado.");
        }

        const senhaCriptografada = await bcrypt.hash(senha, 10);

        // Insere o administrador no MySQL
        await db.query(
            `INSERT INTO administradores (adminNome, adminEmail, adminSenha)
             VALUES (?, ?, ?)`,
            [nome, email, senhaCriptografada]
        );

        console.log("Administrador cadastrado:", nome);

        res.redirect("/entrar");

    } catch (erro) {
        console.log("Erro ao cadastrar administrador:", erro.message);
        res.status(500).send("Erro ao cadastrar administrador.");
    }
});



app.get("/jogo/:id", async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).send("ID de jogo inválido.");
        }

        const resultado = await db.query(`
            SELECT
                j.jogoID AS id,
                j.jogoNome AS nome,
                j.jogoDescricao AS descricao,
                j.jogoDesenvolvedora AS desenvolvedora,
                j.jogoDataLancamento AS dataLancamento,
                j.jogoImagem AS imagem,
                j.jogoLink AS link,
                GROUP_CONCAT(
                    c.categoriaNome
                    ORDER BY c.categoriaNome
                    SEPARATOR ', '
                ) AS categorias
            FROM jogos j
            LEFT JOIN categoriaJogo cj
                ON j.jogoID = cj.jogoID
            LEFT JOIN categorias c
                ON cj.categoriaID = c.categoriaID
            WHERE j.jogoID = ?
            GROUP BY
                j.jogoID,
                j.jogoNome,
                j.jogoDescricao,
                j.jogoDesenvolvedora,
                j.jogoDataLancamento,
                j.jogoImagem,
                j.jogoLink
        `, [id]);

        if (resultado.length === 0) {
            return res.status(404).send("Jogo não encontrado.");
        }

        res.render("detalhes-jogo", {
            jogo: resultado[0]
        });

    } catch (erro) {
        console.log("Erro ao carregar detalhes do jogo:", erro.message);
        res.status(500).send("Erro ao carregar os detalhes do jogo.");
    }
});

app.listen(port, () => {
    console.log("Servidor rodando na porta", port);
    console.log("A conexão com o banco será necessária apenas nas rotas que utilizam o MySQL.");
});

