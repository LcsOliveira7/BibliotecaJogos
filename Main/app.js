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

app.get("/explorar", (req, res) => {
    res.render("explorar")  
})

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

app.listen(port, () => {
    console.log("Servidor rodando na porta ", port)
    console.log("Acesse o link http://localhost:3000 para visualizar o site ")
})