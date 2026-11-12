
-- 1. CADASTRO DAS CATEGORIAS

insert ignore into categorias (categoriaNome, categoriaDescricao)
values
('Aventura', 'Jogos de exploração e desafios'),
('Sobrevivência', 'Jogos focados em sobreviver e coletar recursos'),
('RPG', 'Jogos com evolução de personagens e histórias'),
('Plataforma', 'Jogos com obstáculos e desafios de movimento'),
('Simulação', 'Jogos que simulam atividades e experiências');


-- 2. CADASTRO DAS PLATAFORMAS

insert ignore into plataformas (plataformaNome)
values
('PC'),
('PlayStation'),
('Xbox'),
('Mobile'),
('Nintendo Switch');


-- 3. IDENTIFICAR O ADMINISTRADOR

-- Utiliza o primeiro administrador cadastrado
set @adminID = (select adminID from administradores order by adminID limit 1);


-- 4. CADASTRO DOS JOGOS

insert ignore into jogos
(jogoNome, jogoDescricao, jogoDesenvolvedora,
jogoDataLancamento, jogoImagem, jogoLink, adminID)
values

('Minecraft',
'Jogo de construção, exploração e sobrevivência em um mundo de blocos.',
'Mojang Studios',
'2011-11-18',
'/images/minecraft.png',
'https://www.minecraft.net',
@adminID),

('Terraria',
'Jogo de aventura em 2D com exploração, construção e combate.',
'Re-Logic',
'2011-05-16',
'/images/terraria.png',
'https://terraria.org',
@adminID),

('Stardew Valley',
'Simulador de fazenda com agricultura, pesca, exploração e relacionamentos.',
'ConcernedApe',
'2016-02-26',
'/images/stardew.png',
'https://www.stardewvalley.net',
@adminID),

('Hollow Knight',
'Jogo de ação e aventura com exploração de um reino subterrâneo.',
'Team Cherry',
'2017-02-24',
'/images/hollowknight.png',
'https://www.hollowknight.com',
@adminID),

('Celeste',
'Jogo de plataforma com desafios de precisão durante a escalada de uma montanha.',
'Maddy Makes Games',
'2018-01-25',
'/images/celeste.png',
'https://www.celestegame.com',
@adminID);


-- 5. RELACIONAMENTO DOS JOGOS COM AS CATEGORIAS

-- Minecraft: Sobrevivência
insert ignore into categoriaJogo (jogoID, categoriaID)
select j.jogoID, c.categoriaID
from jogos j, categorias c
where j.jogoNome = 'Minecraft'
and c.categoriaNome = 'Sobrevivência';

-- Terraria: Sobrevivência
insert ignore into categoriaJogo (jogoID, categoriaID)
select j.jogoID, c.categoriaID
from jogos j, categorias c
where j.jogoNome = 'Terraria'
and c.categoriaNome = 'Sobrevivência';

-- Stardew Valley: Simulação
insert ignore into categoriaJogo (jogoID, categoriaID)
select j.jogoID, c.categoriaID
from jogos j, categorias c
where j.jogoNome = 'Stardew Valley'
and c.categoriaNome = 'Simulação';

-- Hollow Knight: Aventura
insert ignore into categoriaJogo (jogoID, categoriaID)
select j.jogoID, c.categoriaID
from jogos j, categorias c
where j.jogoNome = 'Hollow Knight'
and c.categoriaNome = 'Aventura';

-- Celeste: Plataforma
insert ignore into categoriaJogo (jogoID, categoriaID)
select j.jogoID, c.categoriaID
from jogos j, categorias c
where j.jogoNome = 'Celeste'
and c.categoriaNome = 'Plataforma';


-- 6. RELACIONAMENTO DOS JOGOS COM AS PLATAFORMAS

-- Todos os cinco jogos estão disponíveis para PC
insert ignore into plataformaJogo (jogoID, plataformaID)
select j.jogoID, p.plataformaID
from jogos j, plataformas p
where j.jogoNome in
('Minecraft', 'Terraria', 'Stardew Valley', 'Hollow Knight', 'Celeste')
and p.plataformaNome = 'PC';

-- Minecraft, Terraria e Stardew Valley também estão no Mobile
insert ignore into plataformaJogo (jogoID, plataformaID)
select j.jogoID, p.plataformaID
from jogos j, plataformas p
where j.jogoNome in
('Minecraft', 'Terraria', 'Stardew Valley')
and p.plataformaNome = 'Mobile';

-- Hollow Knight e Celeste também estão no Nintendo Switch
insert ignore into plataformaJogo (jogoID, plataformaID)
select j.jogoID, p.plataformaID
from jogos j, plataformas p
where j.jogoNome in ('Hollow Knight', 'Celeste')
and p.plataformaNome = 'Nintendo Switch';


-- 7. CONSULTA PARA CONFERIR OS JOGOS

select jogoID, jogoNome, jogoDesenvolvedora
from jogos
order by jogoNome asc;
