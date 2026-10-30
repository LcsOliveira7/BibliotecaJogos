
create table administradores (
adminID int not null auto_increment primary key,
adminNome varchar(100) not null,
adminEmail varchar(100) not null unique,
adminSenha varchar(300) not null
);

create table usuarios (
usuarioID int not null auto_increment primary key,
usuarioNome varchar(100) not null unique,
usuarioEmail varchar(100) not null unique,
usuarioSenha varchar(300) not null
);

create table categorias (
categoriaID int not null auto_increment primary key,
categoriaNome varchar(100) not null unique,
categoriaDescricao varchar(200) not null
);

create table plataformas (
plataformaID int not null auto_increment primary key,
plataformaNome varchar(100) not null unique
);

create table jogos (
jogoID int not null auto_increment primary key,
jogoNome varchar(100) not null unique,
jogoDescricao varchar(200) not null,
jogoDesenvolvedora varchar(100) not null,
jogoDataLancamento date not null,
jogoImagem varchar(300) not null,
jogoLink varchar(300) not null,
adminID int not null,
foreign key (adminID) references administradores(adminID)
);

create table recomendacoes (
recomendacaoID int not null auto_increment primary key,
recomendacaoTituloJogo varchar(100) not null,
recomendacaoJustificativa varchar(500) not null,
recomendacaoImagem varchar(300) not null,
recomendacaoLink varchar(300) not null,
recomendacaoStatus varchar(30) not null default 'pendente',
usuarioID int not null,
foreign key (usuarioID) references usuarios(usuarioID)
);

create table categoriaJogo (
jogoID int not null,
categoriaID int not null,
primary key (jogoID, categoriaID),
foreign key (jogoID) references jogos(jogoID),
foreign key (categoriaID) references categorias(categoriaID)
);

create table plataformaJogo (
jogoID int not null,
plataformaID int not null,
primary key (jogoID, plataformaID),
foreign key (jogoID) references jogos(jogoID),
foreign key (plataformaID) references plataformas(plataformaID)
);
