create table categorias (
categoriaID int not null auto_increment primary key,
categoriaNome varchar(100) not null Unique,
categoriaDescricao varchar(200) not null
);
create table jogos (
jogoID int not null auto_increment primary key,
jogoNome varchar(100) not null,
jogoDescricao varchar(200) not null,
jogoImagem varchar(100) not null,
jogoCategoria varchar(100) not null,
foreign key (jogoCategoria) references categorias(categoriaNome)
);
create table usuarios (
usuarioID int not null auto_increment primary key,
usuarioNome varchar(100) not null,
usuarioEmail varchar(100) not null,
usuarioContato varchar(200) not null
);
