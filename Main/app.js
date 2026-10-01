const express = require("express")
const app = express()
const db = require("./db")
const path = require("path")
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
})