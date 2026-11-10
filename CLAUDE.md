# CLAUDE.md — Regras do Projeto DTSIENGE

## Controle de Locações / Aluguéis — SÓ HOLDING (Validado em 2026-07-31)

Página exclusiva do modo Holding: `Financeiro > Locações > Aluguéis` (`/financeiro/alugueis`).
Réplica do Power BI `FINANCEIRO HOLDING.pbix` (páginas "ALUGUEIS À RECEBER" / "ALUGUEIS REALIZADO").

### NAO ALTERAR sem pedido explicito do usuario:
- Regra do que é aluguel em `src/lib/alugueis-utils.ts`:
  - `documentIdentificationId` ∈ {LOC, LNC} **E** alguma `paymentsCategories[].financialCategoryId` ∈ {10513, 10514}
  - 10513 = Receita de locação Pessoa Física · 10514 = Receita de locação Pessoa Jurídica
- Imóvel = `documentNumber` do título (é onde o Sienge guarda o nome do imóvel)
- Realizado = soma de `payments[].netAmount` por `paymentDate`
- A Receber = `correctedBalanceAmount - discountAmount` (NÃO subtrair taxAmount — isso é regra de CP)
- Escopo: 3 empresas (Holding, Silva Packer, Sul Brasil) — as que têm contrato de locação

### Perfil de pagamento do cliente (coluna "Perfil") — Criado em 2026-07-31
- Classifica o CLIENTE (não o imóvel): agrupar por `clientName` é o pagador real
  e ainda contorna variações de grafia do mesmo imóvel ("casa rua 3000" vs "CASA RUA 3000")
- **Tolerância de baixa** (`TOLERANCIA_BAIXA_PADRAO = 5` dias, ajustável na tela para 3/5/7):
  atraso até esse limite NÃO conta como atraso. Motivo: quase sempre é o financeiro
  que ainda não deu baixa no Sienge, não inadimplência do inquilino
- Base do número (1.403 parcelas quitadas): 61,9% sem atraso · 1 a 5 dias = 24,1% ·
  acima de 5 dias = 14,0%
- Crônico = `PCT_CRONICO` (30%) ou mais das parcelas pagas com atraso acima da
  tolerância, com no mínimo `MIN_PARCELAS_PERFIL` (5) parcelas pagas
- Em dia = nenhuma acima da tolerância · Pontual = tem, mas abaixo do corte
- O tooltip do badge sempre mostra quantas parcelas ficaram de fora pela tolerância

### Aba Contratos — vencimento e renovação (Criado em 2026-07-31)
- Um contrato = um `billId` do Sienge (o lote de parcelas criado junto)
- Sucessor é casado pela chave NORMALIZADA do imóvel (`chaveImovel`): sem tirar
  acento/zero à esquerda, "GALPÃO 01 CANELINHA" e "GALPAO 1 CANELINHA" viram
  imóveis diferentes e a taxa de renovação cai de 48% para 30% (erro real cometido)
- Status: `renovado` (tem sucessor) · `vencido` (venceu, sem sucessor) ·
  `vence-breve` (≤ `DIAS_ALERTA_VENCIMENTO` = 90 dias) · `vigente` ·
  `encerrado` (venceu há mais de `MESES_ATE_ENCERRADO` = 6 meses sem sucessor)
- Filtro padrão da tabela: vencido + vence-breve + vigente. "Renovado" fora por
  padrão porque o sucessor já aparece como linha própria — incluir os dois
  duplicaria o imóvel e inflaria a soma do rodapé
- `taxaRenovacao` só conta contratos encerrados há 6+ meses (carência), senão um
  contrato que venceu semana passada contaria como "não renovado"
- **Nunca usar `setMonth()` direto sobre data com dia 31** — usar `deslocarMes`/
  `competencia`. O bug fez setembro e novembro sumirem do cronograma
- Números validados em 31/07/2026: 97 contratos · 18 vencidos (R$ 220.514,68/mês) ·
  5 vencendo em 90d (R$ 20.673,08/mês) · 33 vigentes (R$ 211.390,39/mês) ·
  renovação histórica 49% (22 de 45) com reajuste mediano +6,5%

### Isolamento (regra dura)
- `alugueis-utils.ts` e `alugueis-view.tsx` NÃO são importados por nenhuma tela das demais
  empresas. As fórmulas são duplicadas de propósito (não reutilizam `dashboard-utils`)
- Sidebar: item adicionado só quando `isHolding` — em modo SP o menu volta intacto
- Snapshot em `validations/holding/alugueis.json` (subdiretório de propósito:
  `check-validations.js` só lê `validations/*.json` da raiz)
- Conferência: `node scripts/valida-alugueis.js` → deve dar 0 divergências

Validado contra o Power BI (recorte 01/01/2026 a 11/06/2026, última baixa do CSV do BI):
Total R$ 2.328.855,21 · Silva Packer R$ 1.444.930,96 · Holding R$ 473.940,83 · Sul Brasil R$ 409.983,42

## Módulo Comercial no menu lateral (Criado em 2026-10-22)

- Pedido do Edielson (22/10): replicar o Comercial do Financeiro da Leven
  (`Leven-Construtora/financeiro-leven`, mesma base). Etapa 1 = só mudar de
  lugar, sem alterar cálculo: a aba "Comercial" saiu do Painel Executivo e
  virou o grupo **Comercial** no menu, uma rota por tela: `/comercial/visao-geral`,
  `/vendas`, `/clientes`, `/unidades`, `/quadro-espelho`. Some no modo Holding.
- Peças: `src/lib/comercial-utils.ts` (funções puras + `ABAS_COMERCIAL`),
  `comercial-provider.tsx` (estado, fetch e filtros, montado uma vez em
  `(authenticated)/comercial/layout.tsx`), `comercial-view.tsx` (corpo das
  cinco telas, idêntico ao da aba antiga). `MultiSelectFilter`/`CustomTooltip`
  foram para `multi-select-filter.tsx`, compartilhado com o Painel.
- Chaves de localStorage são as da aba antiga (`dashboard_*_comercial`).
- Opções do filtro Empresas saem dos contratos/unidades (não mais de 15 anos
  de `/outcome`); nenhuma marcada = todas, como a aba antiga ao entrar nela.
- Conferência 22/10 (mesmos dados nas duas versões, Playwright): texto das 5
  telas idêntico entre a aba antiga e as rotas novas.
- **Valor por unidade = parte dela no contrato (22/10)** —
  `valorDaUnidadeNoContrato` em `comercial-utils.ts` (mesma regra da Leven):
  `participationPercentage` do Sienge; se não fechar 100%, divide igual. Até
  22/10 cada unidade recebia o contrato inteiro e o "VGV vendido" do Quadro
  Espelho e da tela Unidades somava o mesmo contrato N vezes (apto + vaga).
  Visão Geral, Vendas e Clientes somam por contrato e não mudaram.
  Trava: `npx tsx src/__tests__/comercial-utils.test.ts`.
- **Corretores e Imobiliárias (22/10)** — `/comercial/corretores`, trazida da
  Leven (`corretores-view.tsx`). Lê quem vendeu nas **comissões** do Sienge
  (`/commissions` → `/api/sienge/commissions`, cache `cached_commissions`, 7 dias
  ou "Atualizar"), não no contrato. Regra única `rankingParceiros` em
  `comercial-utils.ts` (casa comissão e contrato por empreendimento + número sem
  espaços; contrato sem comissão = venda direta); `tipoParceiro` separa
  imobiliária (PJ pelo nome) de corretor autônomo. Com mais de 12 meses o
  gráfico soma por ano. Ainda não conferida com dado real da Silva Packer.
- **Corretor da casa (Edielson, 22/10):** GILBERTO BOING é corretor da casa e
  gerente comercial. `CORRETORES_DA_CASA` em `comercial-utils.ts`: fica no
  ranking com a etiqueta "Da casa"; "Vendido com parceiros" conta só contratos
  com imobiliária/corretor de fora, e o da casa tem cartão próprio.
- **Vendas: Contar por Unidades | Contratos (22/10, da Leven).** Abre em
  Unidades (estado local, sem preferência salva). Cada unidade dos contratos
  filtrados conta (`unidadesVendidas`), com a parte dela no valor
  (`valorDaUnidadeNoContrato`); o tipo vem do cadastro do Sienge
  (`propertyType`), senão do nome. Com Tipo Imóvel marcado, só as unidades do
  tipo contam. Modo Contratos = números de antes.
- **Exportar Excel (Vendas, 22/10):** `src/lib/excel-unidades-vendidas.ts`
  (exceljs; o `xlsx` grátis não grava estilo), uma linha por unidade + aba
  "Estoque no Sienge" por situação.
- **Quadro Espelho: situação e botão Valores (22/10, da Leven).** Regra única
  `situacaoDaUnidade` em `src/lib/situacao-unidade.ts` (trava
  `situacao-unidade.test.ts`): Vendido vermelho · Disponível verde ·
  Permutante roxo (unidade vendida em contrato todo PE, `ehPermuta`) ·
  Reservado amarelo (Reserva Técnica) · Proposta cinza · Vendido/Terceiros
  rosa. Sem Investidor/Permuta de serviço (classificação manual que a Silva
  Packer não usa). "Vendidas", "% vendido" e VGV = Vendido + Permutante (o
  mesmo estoque Vendida de antes). Filtro Situação do Quadro é estado próprio
  (`selectedSituacoes`), separado do status da tela Unidades. Botão **Valores**
  desligado por padrão (`quadro_espelho_mostrar_valores`, "1"/"0"): desligado
  = nenhum R$ no Quadro (célula, dica, VGV, cartão da Grade).
- **Maquete 3D do Quadro (23/10, piloto Palácio Elizabeth).** Terceira visão
  do Quadro (Espelho · **3D** · Grade). Estudo de massa gerado dos dados do
  Sienge, sem maquete do arquiteto: cada apartamento é um bloco do pavimento
  tingido pela situação; a sacada leva a cor forte. Geometria toda em
  `src/lib/torre-3d.ts` (trava `torre-3d.test.ts`): `CONFIG_PALACIO` (2 por
  andar, espelhados, sacadas encostadas no meio da frente; medidas estimadas
  pela planta), `andarEFinal` lê andar/final do nome (AP3001 → 30/"01"),
  `ordenarFinais` decide o lado (ajuste de lado só ali). Embasamento = os
  pavimentos abaixo do 1º andar de apartamentos. `torre-3d.tsx` (three.js via
  `next/dynamic`, só baixa ao abrir o 3D): clique abre o card da unidade
  (cliente só com dono, valor só com Valores ligado). Só apartamentos; vagas
  ficam na Torre. Outro empreendimento usa `CONFIG_PADRAO`.
- **Maquete detalhada (23/10, pedido do Edielson: "não ficar um pavimento reto
  sem janelas").** Torre pela **planta baixa tipo** (arquitetônico 1/50,
  mar/2022, "tipo 9º ao 42º", 34×): lâmina 32,5 × 10 m, final 01 à esquerda,
  sacada única de 14,1 × 3 m no meio da frente (dividida ao meio), núcleo de
  6,1 m saindo 4,3 m pelos fundos. Janelas uma a uma em
  `CONFIG_PALACIO.janelasTipo` (posição medida da quina; o final 02 é o
  espelho), desenhadas por `janelasDaUnidade` e instanciadas (clique na janela
  também abre a unidade). Pilastras de pastilha nas quinas, cinta a cada 10
  andares, coroamento. Base (`ConfigBase`, desenho em
  `src/components/torre-3d-predio.ts`): contorno tirado da planta do lazer,
  frente com lojas, toldos, friso
  ornamental, garagens com veneziana em arco e portal de vidro no eixo da
  torre; laterais só garagens; planta humanizada do lazer
  (`public/modelos/palacio-lazer.webp`) deitada na cobertura. Texturas
  desenhadas em canvas, sem arquivo. Pelas fotos da galeria do
  site (23/10): coroamento pela perspectiva da fachada (Edielson, 24/10: as
  duas cúpulas da foto aérea estavam erradas, e não há nada nos fundos) =
  torre branca no meio da frente, sobre a prumada das sacadas, subindo ~2
  pavimentos acima da platibanda com o logo (`/logo-icon.jpg`) na face da
  frente, e de cada lado dela uma abóbada escura (meia-cana com eixo
  frente-fundos) até a quina; guarda-corpo do lazer com pilaretes + vidro escuro + floreira na frente, e
  alambrado de 4 m na quadra (`ConfigBase.quadra`).
- **Medidas pelos projetos do Rodrigo (engenheiro, 23/10, WhatsApp):** cortes
  AA/BB e plantas térreo/mezanino/garagens 1–4 (1/75, mar/2022). Cotas:
  salas comerciais com mezanino 0,00–5,40 · garagens +5,40/+8,05/+10,70/
  +13,35 · lazer +16,00 · **7º e 8º "tipo diferenciado"** +21,04/+24,28 ·
  tipo 9º–42º, **3,24 m piso a piso** (42º a +134,44); casa de máquinas e
  reservatórios ~7 m acima da cobertura. **O Sienge numera do 1º:** AP101 = 7º
  pavimento do projeto, AP3602 = 42º (quadro espelho do Sienge, 23/10) — os
  andares do 3D e do card são os do Sienge. `CONFIG_PALACIO.cotaRef` = andar 1
  a +21,04 e `cotaDoAndar` conta dali. `primeiroAndar` (opcional) desenha sem
  situação andares do projeto que o Sienge não tenha; o Palácio não usa. Base em L de **60,24 × 22,7 m + 24 × 16 m** nos fundos (a
  quadra); a planta do lazer é **33,28 px/m** (a escala antiga, 18,55 pela
  quadra, deixava a base 1,8× maior). Torre a 35,9 m da divisa esquerda, com
  a frente a 3,3 m da Rua 2.950. PDFs fora do repositório (WhatsApp do
  Rodrigo e arquivos do projeto, `comercial/projetos-palacio/`).
- **Espelho ao lado do 3D, tela cheia e Ficha do contrato (23/10, Edielson).**
  No 3D, o painel da esquerda tem o "Espelho por pavimento" (andares do
  Sienge, decrescentes): clicar numa unidade seleciona e leva a câmera até
  ela (voo suave, cancelado se o usuário arrastar). Botão Home volta à vista
  inicial; **Tela cheia** usa a Fullscreen API no contêiner (sem ela, cobre
  a janela com `fixed inset-0`); Esc sai. Antes o botão com ícone de tela
  cheia só reposicionava a câmera. **Ficha do contrato**
  (`ficha-contrato.tsx`, da Leven, sem classificação): abre por "Ver
  contrato" no card do 3D e pelo clique na unidade no Espelho 2D e na Grade
  (só unidade com contrato ativo, o mais recente não cancelado). Mostra
  compradores, unidades do contrato com a parte de cada uma, posição
  financeira e condições de pagamento; cada condição expande nas parcelas
  reais do `/income` (casadas por `receivableBillId` do contrato, paga /
  atrasada / a vencer). Com Valores desligado todo R$ vira "R$ ••••".
- **3D para apresentação (23/10, Edielson).** (1) Ficha do contrato na tela
  cheia abre DENTRO dela (`DialogContent container=`; o portal no body fazia o
  navegador sair da tela cheia). (2) Unidade selecionada: as demais esmaecem
  para o tom da fachada, moldura amarela pulsando e etiqueta "1202 · 12º
  andar" presa ao prédio (posição projetada no laço). (3) Legenda do 3D é
  filtro clicável (estado local, vale na tela cheia, onde os filtros da página
  somem); filtrar limpa a seleção. (4) **Entorno** (ruas com nome, quadras,
  verde, areia, mar) do OpenStreetMap: `CONFIG_PALACIO.local` (Rua 2950 nº 255
  e Rua 2970, carimbo das plantas). O SERVIDOR baixa do Overpass uma vez
  (`/api/entorno-3d`, tabela `entorno_3d`; `?refazer=1` baixa de novo) e acha
  o lote pela rua: nº = metros desde a ponta da orla, lado = o da rua dos
  fundos (`localizarLote` em `entorno-osm.ts`, trava `entorno-osm.test.ts`).
  Errou a posição ao longo da rua → `local.ajusteX` (m). Leve: cada camada
  é uma malha, Lambert, sem sombra; nomes de rua deitados no asfalto a cada
  ~300 m (`torre-3d-entorno.ts`). O contêiner de nuvem do Claude não alcança o
  OSM: conferido só com cidade sintética.
  Na 1ª publicação (23/10) o mapa não apareceu e a tela não avisava: agora
  mostra "Carregando…"/"indisponível", o nome da rua casa qualquer grafia
  com o número (`Rua 2.950`, `Rua 2950 - Centro`; o ponto vai como `[.]`,
  nunca `\.`, que o Overpass recusa) e `/api/entorno-3d?chave=…&diag=1`
  devolve a última falha (etapa, erro, tentativa por servidor).
  **Praia e bússola (Edielson, 23/10, "o pessoal quer saber onde fica a
  praia"):** prédios só até `RAIO_PREDIOS` (900 m); ruas principais, verde,
  areia e mar até `RAIO_LONGE` (1,8 km); neblina de 1 a 2,1 km esconde a
  borda. Bússola N/S/L/O no canto (gira com a câmera; `norte` vem no dado
  do entorno). `VERSAO_ENTORNO` no dado: versão antiga no banco é servida
  na hora e refeita em segundo plano (a próxima abertura já vem nova); o
  cliente pede com `&v=` para não pegar a resposta antiga do navegador.
  A tela pergunta de novo a cada 20 s (até 10 min) enquanto a versão não é a
  atual e troca o mapa na cena na hora ("Atualizando o mapa da cidade…"); a
  bússola só existe com o dado novo (`norte`). Depois de uma falha o servidor
  espera 2 min para tentar de novo; a espera do fetch (200 s) tem de ser
  maior que o `timeout` da consulta Overpass (180 s).
  **Ver planta:** botão no card da unidade abre a planta humanizada do tipo
  (`CONFIG_PALACIO.planta`, imagem do site `SIL_ELI_PH_TIPO` em
  `public/modelos/palacio-planta-tipo.webp`), dentro da tela cheia. A imagem
  é o final 01; o 02 sai espelhado. Andares 1–2 do Sienge (7º e 8º
  diferenciados) mostram a planta tipo com aviso. Desde 24/10 o diálogo tem
  abas: **Planta** (imagem), **Tour 3D** (`planta-dollhouse.tsx`: a imagem
  vira o piso, as paredes vêm de `palacio-planta-tipo.paredes.json` gerado
  por `scripts/extrair-paredes-planta.py`, ambientes marcados em px em
  `CONFIG_PALACIO.planta.tour`, final 02 = maquete invertida em x) e
  **Fotos** (`planta-fotos.tsx`): ficam na tabela `plantas_fotos` do banco
  (chave = `local.chave`), gerenciadas na própria aba por qualquer usuário
  logado (enviar JPG/PNG/WebP até 8 MB, renomear, mover, apagar) via
  `/api/plantas/fotos`. Os 6 renders de `public/modelos/palacio-fotos/`
  entram UMA vez pelo `scripts/migrate.js` (só enquanto a sequência da
  tabela nunca foi usada); apagar tudo não faz o seed voltar.
  Planta de outro empreendimento: rodar o script, marcar os ambientes e
  cadastrar `planta.tour` na config dele; as fotos entram pela tela.
  **Valor e condições** (Edielson, 24/10; botão verde no card da unidade
  sem dono): modal com preço de tabela (`u.preco`), R$/m², condições de
  pagamento do empreendimento e fluxo (quando/quanto). Regras puras em
  `src/lib/condicoes-pagamento.ts` (trava `condicoes-pagamento.test.ts`):
  sinal + mensais até as chaves + balões anuais + chaves + saldo (calculado,
  fecha 100%) em N parcelas após as chaves; mês das chaves vem das condições
  salvas, senão de `ConfigTorre.entrega` ("2029-12" no Palácio), senão é
  estimado. Guardadas em `condicoes_pagamento` (chave = `local.chave` ou
  nome do Sienge em slug) via `/api/condicoes-pagamento`; qualquer um simula
  na tela, salva quem edita a tabela de preços (`TABELA_PRECOS_EMAILS`).
  "Copiar resumo" gera texto para WhatsApp/e-mail. Sem preço de tabela o
  modal avisa e manda cadastrar em Comercial › Tabela de preços.
  **Tabela comercial manual** (Edielson, 24/10; PDF do Guberto, diretor
  comercial): tabela `tabela_comercial` (chave = slug do nome do Sienge ou
  chave contida nele — `tabelaComercialPara`; unidade sem prefixo "AP" e
  só dígitos/letras — `nomeUnidade`, porque no Sienge da SP a unidade é
  "102"), JSON com `disponiveis` (unidades à venda),
  `precos` por unidade, `referencia` e `entrega`. Regra
  (`src/lib/tabela-comercial.ts`, trava `tabela-comercial.test.ts`): listada =
  Disponível; não listada e Disponível/Reservado/Proposta no Sienge = Vendido;
  Vendido/Permutante do Sienge ficam. Aplicada em `comercial-view.tsx`
  (Quadro, Espelho, 3D, contagens) e o preço do painel cai no da tabela
  comercial quando a unidade não tem preço. Edição na tela Tabela de preços
  (card âmbar + coluna "Tabela comercial", só editores), com "Aplicar preços
  à tabela de preços" (grava com histórico). Seed único do Palácio em
  `scripts/dados/tabela-comercial-palacio-2026-10.json` pelo `migrate.js`
  (12 à venda: 102, 201, 301, 401, 402, 501, 502, 601, 602, 1202, 3102, 3202).
  Condições reais da mesma tabela em `CONFIG_PALACIO.condicoes` (10% +
  saldo em 100×, entrega 2030-12) = referência do modal até alguém salvar.
  **Resumo** (Edielson, 26/10; botão de gráfico na barra, também na tela
  cheia, desligado por padrão): cards no topo (`resumo-3d.tsx`, números em
  `src/lib/resumo-vendas.ts`, trava `resumo-vendas.test.ts`): Unidades (%
  comercializadas), Vendidas, Disponíveis (estoque à tabela), Permuta, VGV
  vendido, Ticket médio e R$/m² vendido (com R$/m² da tabela). **VGV, ticket e
  m² só com situação "Vendido"** (permuta e vendido por terceiros ficam fora
  do R$, mas contam nas quantidades); só contratos com valor; m² só das que
  têm valor e área. Clicar em Vendidas/Disponíveis/Permuta liga o filtro da
  legenda. Os R$ aparecem independentemente do botão "Valores" (o Resumo é
  uma ação explícita do usuário).
  **Modo noite** (Edielson, 24/10, ideia do vídeo da AVVA): botão lua/sol na
  barra do 3D (vale na tela cheia; lembrado em `localStorage.quadro3d_noite`).
  À noite: céu `#060d1f`, hemisfério/sol azulados e fracos, fachada neutra
  escura, sacadas de vidro escuro e as JANELAS das unidades vendidas e
  permutadas (`temDono`) acesas em amarelo quente; as à venda apagadas. O
  vidro (`matVidroJ`) tem `emissive` branco × cor da instância
  (`onBeforeCompile` multiplica `totalEmissiveRadiance` por `vColor`) ×
  `emissiveMap` de "interior" (canvas: centro quente, bordas escuras,
  cortina), com `emissiveIntensity` 1,15 só à noite. Cada janela tem um
  fator determinístico (0,55–1; ~12 % apagadas, nunca a primeira da
  unidade; ~20 % em luz fria; porta da sacada × 0,55) para não virar bloco
  chapado (Edielson, 24/10: "parece lâmpada lá dentro" no vídeo da AVVA).
  À noite o render passa pelo `EffectComposer` com `UnrealBloomPass`
  (0,6 / 0,5 / limiar 0,7) + `OutputPass`; de dia é direto. `pintar()`
  cuida das duas versões; seleção/filtro continuam valendo.
  **Música de fundo** (Edielson, 24/10): `public/audio/quadro-3d-ambiente.mp3`
  ("Elegant Piano", leberch, Pixabay Content License — fonte e termos em
  `public/audio/LEIA-ME.md`). Toca em loop a 70% (faixa normalizada a -16 LUFS) ao entrar na tela cheia
  (navegador só libera áudio após um clique), para ao sair; botão de
  alto-falante liga/desliga a qualquer hora e grava a escolha em
  `localStorage.quadro3d_musica` (`off` = não entra sozinha). Aba escondida
  pausa e volta. Trocar a faixa = trocar o arquivo e o LEIA-ME. (5) **Andamento da obra** (anéis no
  rodapé do 3D): `/api/andamento-obra` relê a página do site
  (`local.site`) a cada 6 h e só aceita se achar as 9 etapas
  (`lerAndamentoDoHtml`, trava `andamento-obra.test.ts`); senão vale o
  gravado (tabela `andamento_obra`, partida = site em 23/10: 100/100/55/15/
  2/2/0/0/0). Edita à mão quem edita a Tabela de Preços (lápis no card).
- **Tabela de Preços (23/10, da Leven).** `/comercial/tabela-precos`
  (`tabela-precos-view.tsx`): preço de tabela por unidade cadastrado no painel
  (não no Sienge), reajuste em lote por %, valor fixo ou CUB (calculado no
  servidor, `/api/tabela-precos/reajuste`) e histórico. Regras em
  `src/lib/tabela-precos.ts` (trava `tabela-precos.test.ts`). Tabelas
  `tabela_precos_unidades` e `tabela_precos_historico` nascem na 1ª chamada
  (`ensureTabelaPrecos` em `db.ts`); toda gravação passa por `gravarPrecos`
  (preço + histórico na mesma transação). **Quem edita:** só quem está em
  `TABELA_PRECOS_EMAILS` (senão `RESERVA_UNIDADE_EMAILS`; sem as duas,
  ninguém). Desde 09/11/2026: Edielson, `admin@silvapacker.com.br` e o Carlos
  Humberto (`carloshumberto@silvapacker.com.br`); administradores do Portal
  também editam (ver "Administradores editam"). Com Valores ligado, o Quadro e o 3D mostram o preço de
  tabela nas unidades sem venda.
- **Escopo do Comercial na Silva Packer (Edielson, 23/10): só visualização.**
  Nada de reserva nem de proposta/contrato pelo painel (diferente da Leven):
  o painel mostra o que já está vendido (com a ficha do contrato) e o que
  está disponível. A única coisa que se edita é a Tabela de Preços (preços e
  reajustes), que fica no banco do painel e não escreve no Sienge.
- **Suprimentos removido deste app (Edielson, 22/10):** aqui ficam só Financeiro
  e Comercial. Telas `/suprimentos/*` apagadas e redirecionadas ao Dashboard
  (`next.config.mjs`); as rotas `/api/sienge/purchase-*` e
  `/api/arrival-confirmations` continuam no código.

## Painel Executivo CP/CR — tela única e interação Power BI (Edielson, 06/11/2026)

Motivo: Carlos Humberto (Silva Packer) passa a usar o painel todo dia e vem de anos no
Power BI "CONTAS À PAGAR" (anos e meses em botões, clique na empresa filtra tudo).

- **Padrão visual Silva Packer** (mesmo do Portal, GED, Metas e Pedidos): `slate` virou
  cinza quente em `tailwind.config.ts`, fundo papel/tinta/bordas em `globals.css`
  (`--background 0 25% 98%`, `--border 348 20% 91%`), títulos 600/-0.02em. Carmim
  (`primary`) só para estado ativo (chip, pílula, card filtrado). Vale no app todo.
- **Abas CP/CR** (`a-pagar`, `pagas`, `atrasadas`, `a-receber`, `recebidas`,
  `inadimplencia`) ocupam exatamente a janela: raiz `md:h-[calc(100vh-7rem)]`
  (header 64 px + padding 48 px), gráficos em `flex-1 min-h-0` com
  `ResponsiveContainer height="100%"`. Sem barra de rolagem a 100% de zoom com a
  sidebar aberta (1920×~950). Nada de altura fixa nos gráficos dessas abas.
- **Cards**: borda fina, sem sombra/ícone, ponto de estado; valor em
  `text-[clamp(1rem,1.15vw,1.5rem)] whitespace-nowrap` — nunca `truncate`.
  Grade `grid-cols-2 md:grid-cols-3 2xl:grid-cols-N` (N = nº de cards; mapa `colsXl`).
- **Período em botões** (`isCpCrTab`): anos de `availableYears` e os 12 meses
  (`MONTH_OPTIONS`; mês sem dado fica esmaecido) e os trimestres 1T–4T (`TRIMESTRES`,
  pedido do Edielson em 06/11). **Cada clique marca ou desmarca, acumulando** (Edielson:
  "vai clicando, vai selecionando; clica de novo, tira"), sem Ctrl. **"Todos" alterna**:
  marca todos, e o clique seguinte desmarca todos; nenhum marcado = sem filtro (mostra
  tudo), e o "Todos" fica aceso nos dois estados. Desmarcar o último ano visível zera
  o filtro de ano (= todos). Os dropdowns Anos/Meses continuam só nas demais abas
  (Geral, Saldos, Resumo, DRE…). Mesmo estado `selectedYears`/`selectedMonths`.
- **Filtro cruzado**: `drillCompany` (clique na barra de "Por Empresa") entra em
  `applyFilters`, `filtrarPagas`/`filtrarRecebidas`; os gráficos usam variantes
  `{ semDrill }` (Por Empresa mostra todas as barras, a clicada em cor cheia) e
  `{ semMes }` / `itemsPagasSemMes` + `matchesPaymentYearOnly` (Evolução Mensal mostra
  os 12 meses, o escolhido em cor cheia, os outros em `dimBar`). KPIs e tabelas
  continuam saindo de `filteredX` — as fórmulas validadas não mudaram.
- Cards "Vence Hoje/7/15/30" ligam `selectedDuePeriods`; o total limpa.
  Detalhamentos (Credores/Clientes, Atrasadas, Inadimplentes) abrem em `Dialog`
  (`semFechar`, o card tem o próprio X) em vez de empurrar a tela.
- **Demais abas (06/11, "Geral também"):** a raiz do painel é sempre
  `flex flex-col md:h-[calc(100vh-7rem)]`. **Geral**: 6 cards + Fluxo de Caixa
  (`flex-1`) + 3 cards de insight cabem na janela. **Orçamento**: CUB e totais numa
  linha de 6 cards; a tabela rola dentro do card se precisar. **DRE, Saldos, Resumo,
  Indicadores, Comparativo e Calendários**: moldura fixa (cabeçalho, seções e
  filtros não saem do lugar) e o conteúdo rola dentro de `flex-1 min-h-0
  overflow-y-auto` — tabelas longas não cabem numa tela, então a rolagem é interna,
  nunca da página. Cards dessas abas usam `CardPainel` (fim do arquivo).
- **Visual minimalista em TODAS as abas (Edielson, 06/11, "pode fazer em todas"):**
  DRE (`dre-tab.tsx`), Saldos, Resumo, Indicadores (`indicadores/*`), Comparativo
  (`comparativo-tab.tsx`) e Calendários (`calendario-*-tab.tsx`) seguem o mesmo padrão:
  card branco com borda fina e sem sombra, sem degradê, sem card colorido (a cor vai
  para o ponto antes do rótulo e, quando faz sentido, para o valor), cabeçalho de tabela
  claro (`bg-slate-50 dark:bg-slate-800`, texto cinza em caixa alta — nunca o escuro
  `bg-slate-800 text-slate-100`), seletores ativos em carmim. Tela de carregamento idem.
  Ao criar card novo no painel, use `CardPainel` ou copie essas classes.
- **Modo escuro neutro (Edielson, 06/11: "esse meio marrom não está bonito"):** o `slate`
  quente vale só nos tons 50–200 (papel); de 300 para cima é cinza neutro (zinc), com
  950 = `#111113` ("um preto, mas não absoluto"). Tokens `.dark` em `globals.css` são
  neutros (`--background 240 6% 7%`). Contraste mínimo 4,5:1 em todo texto, nos dois
  temas: pílula ativa no escuro tem texto branco (`dark:text-white`), pílula inativa é
  `text-slate-600 dark:text-slate-400`, chip "fraco" é `text-slate-500 dark:text-slate-400`,
  eixos dos gráficos usam `chartColors.mutedText`. Há uma auditoria por JS (razão de
  contraste de cada texto contra o fundo) — rodar nos dois temas antes de subir mudança
  de cor; nenhum elemento abaixo de 4,5:1 em 06/11.
- Rodar local: `.env.local` (gerado do env do serviço `spapi` no EasyPanel, com banco
  Docker `spapi-sp-db` na porta 5447 e login `admin-local`); `node scripts/migrate.js`
  com `DATABASE_URL` exportada. Primeira carga puxa 10 anos do Sienge (~3 min).

## Painel Executivo abre direto com o que já carregou (Edielson, 09/11/2026)

- Pedido: "toda vez que clica no painel executivo, ele fica carregando". Cada abertura
  baixava e lia de novo ~350 MB de JSON do cache do painel (CP 137 MB, CR 63 MB, movimentos
  bancários avulsos 10 MB e todos, p/ DRE, 137 MB) e o navegador travava.
- **Na tela** (`cachePainel` no topo de `executive-dashboard.tsx`): os dados ficam na
  memória da aba. Voltar ao Painel abre na hora, sem a tela "Carregando" (0,7 s local), e em
  segundo plano cada pedido vai com `?versao=<cachedAt>` (era `?desde=`): o servidor responde
  `{ naoMudou: true }` (0 kB) ou o dado novo, e só o que mudou é baixado (rotina diária ou
  "Atualizar" de outra pessoa). Só vale depois da carga principal completa (CP + avulsos +
  CR). "Atualizar" continua indo ao Sienge. (F5 e aba nova: ver "Nunca esperar" abaixo.)
- **No servidor** (`responderDoCacheSienge` em `src/lib/cache-sienge-resposta.ts`,
  `getCacheCachedAt`/`getCacheTextoDados` em `db.ts`, texto em `cache-texto.ts`, trava
  `cache-texto.test.ts`): outcome, income e bank-movements devolvem o `data::text` do
  PostgreSQL com o `cachedAt` acrescentado no texto (sem JSON.parse/stringify no Node) e
  **em gzip**: o Next NÃO comprime as rotas de API em produção (conferido 09/11: até o
  `/api/indicadores` saía cru) e a 1ª carga baixava ~400 MB (30 s por pedido). gzip nível 6:
  CP 144 → 6,6 MB, CR 66 → 1,5 MB, avulsos 11 → 0,4 MB; local CP 3,5 s → 0,8 s. O gzip fica
  na memória do servidor por versão do cache (até 12 chaves): só comprime de novo quando o
  cache muda. Mesmo JSON de antes.
- Conferido local: Visão Geral idêntica (100 linhas) entre a volta pela memória e uma
  carga completa; com o CR mudado no banco, só ele foi baixado de novo (66 MB).
- **Nunca esperar, nem na 1ª abertura (Edielson, 09/11: "o Carlos Humberto [...] não gosta
  de ver as coisas demorar"):** em produção a 1ª abertura depois de cada mudança do cache
  levava ~30 s (servidor lendo e comprimindo na hora).
  - **gzip pronto antes do pedido** (`prepararCachePainel`): as 4 chaves do Painel
    (`chavesDoPainel`) são lidas e comprimidas uma de cada vez ao subir o servidor
    (`src/instrumentation.ts`, 15 s depois; `experimental.instrumentationHook` no
    `next.config.mjs`), depois da rotina diária e do `atualizar_cache` do MCP
    (`prepararPainelDepoisDaRotina`, em segundo plano) e no "Atualizar" (a resposta do
    "Atualizar" agora sai do cache recém-gravado, em gzip). Local: 7,9 s ao subir. A memória
    fica em `globalThis` porque o Next empacota o instrumentation e as rotas separados.
  - **Navegador guarda no disco:** a URL normal vai com `ETag = cachedAt` e
    `Cache-Control: private, no-cache`; aba nova ou F5 → `If-None-Match` → **304** sem corpo.
    Na mesma aba o Painel pergunta com `?versao=` (`{naoMudou}` ou `{mudou}` → aí pede a URL
    normal, mantendo uma entrada só por base no disco). `?desde=` ficou para abas abertas antes
    (mudou → dado inteiro, como antes). O navegador embutido do Claude não guarda respostas de
    6–9 MB (só as menores); Chrome desktop guarda.
  - **Rotina diária grava as chaves do Painel** (`periodosDoPainel` em
    `src/lib/painel-periodos.ts`, uma fonte só para tela, rotina e servidor): o CR era gravado
    até 2031 e o Painel lê até 2041 — o CR do Painel só se renovava no "Atualizar" ou ao vencer
    (7 dias, aí ia ao Sienge na hora). Agora grava o CR do Painel e DEPOIS o do MCP
    (`REFRESH_START..REFRESH_END`; o MCP pega "o mais recente que cobre" e não muda de número),
    e em segundo plano os movimentos bancários todos (`all:`, DRE e tarifas das Pagas).
  - **Badge "Contas Vencidas" do menu** (`/api/sienge/outcome/vencidas`,
    `contarParcelasComSaldoNoCache` em `db.ts`): contado no PostgreSQL sobre o cache do Painel
    (~0,7 s, guardado por versão). Antes o menu ia ao Sienge todo dia buscar o CP do ano até
    hoje (chave nova por dia, 35 MB, sem limpeza). Mesma regra: vencimento no ano até hoje
    inclusive e saldo > 0 (local 09/11: 394 nos dois).
  - A rotina do GitHub (`0 9 * * *` = 06:00) tem rodado entre 12h30 e 14h no horário de
    Brasília (atraso do agendador do GitHub).

## Conferência com o Power BI "FINANCEIRO GERAL", quadro a quadro (Edielson, 07/11/2026)

- Motivo: o Carlos Humberto vem do Power BI; painel e BI têm de bater em cada quadro.
- O BI é um projeto **.pbip** (texto, dá para ler sem abrir o Power BI):
  `C:/Users/Desktop/OneDrive - DTCONSULTORIAS/SILVA PACKER/PBIX/FINAIS/FINANCEIRO/FINANCEIRO GERAL.pbip`.
  Medidas em `FINANCEIRO GERAL.SemanticModel/definition/tables/MEDIDAS.tmdl`, consulta M de
  cada tabela no próprio `.tmdl` (ex.: `f_RECEBER.tmdl`), visuais e filtros de página em
  `FINANCEIRO GERAL.Report/definition/pages/<id>/visuals/*/visual.json`. Histórico do BI em
  `CONTEXTO_FINANCEIRO_GERAL.md` na mesma pasta.
- **Contas a Receber › Total a Receber — conferido 07/11 (1º quadro):** card, "Por Empresa"
  e "Evolução Mensal" = medida `Total a Receber Futuro`. Regra única em
  `src/lib/a-receber-regra.ts` (trava `a-receber-regra.test.ts`): saldo corrigido > 0,
  vencimento ≥ hoje, condição ≠ Permuta e **aluguel sai pela CATEGORIA 10513/10514**, não
  pelo tipo de documento. Antes saía por "Contrato de Locação": +R$ 2.000,00 (acordo Bigliardi,
  doc CONTRATO, categoria 10514) e −R$ 108,08 (ressarcimento de IPTU em doc "Locação Não
  Contábil", categoria 2090111) na Silva Packer Construtora. Depois: 2026 = R$ 7.635.160,05,
  as 11 empresas e nov/dez iguais ao BI. "Contrato de Locação…" que não é aluguel não é cortado
  pelo filtro Tipo Doc (`ignoraFiltroTipoDoc`; o tipo não aparece no filtro do CR). Vale no
  card, gráficos, Calendário de Recebimentos e coluna A Receber do Resumo. **Modo Holding não
  muda** (lá o A Receber é o aluguel). DRE e Comparativo continuam em `consistentIncome`
  (regra antiga, com o corte de "Contrato de Locação").
- **Contas a Receber › Inadimplência — conferido 07/11 (2º quadro):** medidas `Total Vencidas`
  e `% Atrasada` do BI. Mesma lib (`entraNasVencidas`, `entraNaCarteiraAberta`): vencida
  (vencimento < hoje), saldo corrigido > 0, sem Permuta, **COM aluguel** (no BI a exclusão por
  categoria está comentada) e **SEM multa e juros**. % Atrasada = vencidas ÷ carteira em aberto
  (a vencer + vencido, com aluguel, sem Permuta). 2026: R$ 2.544.304,20 e 23,59 %, iguais ao BI.
  Cards fora da Holding: Total Vencidas · % Atrasada · **Com multa e juros** (a soma antiga,
  multa 2 % + juros 1 % a.m., que bate com a "Posição de Inadimplência" do Sienge — validada
  em 08/05/2026, fica como card à parte) · Empresas · Clientes. Gráficos = saldo sem encargo;
  a tabela de inadimplentes continua com Acréscimo e a coluna virou "Total c/ multa e juros".
  O card Inadimplência do **Geral** usa o mesmo % e o Total Vencidas. Filtro Tipo Doc não corta
  "Contrato de Locação…" no CR (o tipo não aparece nele). Holding: cards e regra antigos.
- Diferenças do BI que o painel NÃO copiou: o BI soma `correctedBalanceAmount` sem tirar
  desconto (o painel tira `discountAmount`; em 07/11 nenhuma parcela aberta tinha desconto),
  a consulta do BI corta o `billId` 437 de qualquer empresa (gambiarra; nada em aberto) e o
  BI não tira documento de PREVISÃO (o painel tira; nada em aberto em 07/11).
- **Contas a Receber › Contas Recebidas — conferido 07/11 (3º quadro, Faturamento):** medida
  `Total Recebido` = Líquido por data da baixa de um Excel exportado do Sienge
  (`SILVA PACKER/RECEBER/relatorio.xlsx`, tabela `f_RECEBIDAS_CSV`), tirando todo documento
  cujo "<tipo>.<número>" contém "TRAN", **sem filtro de aluguel** e sem a Holding (filtro da
  página). Painel fora da Holding (`incomeRecebidas` + `ehDocumentoTransferencia` na mesma
  lib): base `incomeBaseReceber` (COM aluguel) + movimentos bancários avulsos só das empresas
  do modo (antes os da Holding vazavam no modo Silva Packer: R$ 7.004.390,25 em 2026), menos
  TRAN. Antes: Silva Packer Construtora −R$ 2.061.173,62 (aluguel −2.461.173,62, repasse TRAN
  da Holding +400.000) e Sul Brasil +R$ 663.381,21 (aluguel −717.019,82, resgate de aplicação
  TRAN +1.380.401,03); as outras 10 já batiam. Depois: 2026 = **R$ 62.444.306,50** e 2025 =
  R$ 86.965.479,17, iguais ao BI nas 12 empresas e mês a mês. A aba **Resumo** (Total
  Recebido e Lucro Realizado) usa a mesma lista e acompanhou. Holding: regra antiga.
- Página CONTAS À RECEBER do BI fechada. O que sobra nela são cards que o painel não tem:
  `Fat. ano anterior:` + YoY (Total Recebido de 01/01 até hoje no ano anterior) e
  `Saldo Estimado Entradas 2` (= A Receber Futuro + Vencidas, ambos já iguais).
- **Contas a Pagar › A Pagar — conferido 07/11 (página CONTAS À PAGAR do BI,
  `9b648ba73a754ca52976`, 1º quadro):** card `À Pagar sem prev CARD.` = `Geral a Pagar
  Ajustado` − `Contas Atrasadas` sobre `f_PAGAR` (/outcome por vencimento, indexador 0).
  Regra em `src/lib/a-pagar-regra.ts` (trava `a-pagar-regra.test.ts`): saldo corrigido > 0,
  a vencer, qualquer documento menos as previsões PPC/PPE/PRV/PCT, sem olhar a
  consistência do título (**revisto em 09/11: não consistido fica fora**, ver abaixo) e com
  **toda Previsão de Comissão (PRC) em aberto, mesmo vencida** (**revisto em 09/11: PRC fora**)
  (o BI tira PRC das Atrasadas mas não do total). Decisões do Edielson em 07/11: contar os
  não consistidos (135 Jardins R$ 51.048,22, Chave Digital; Domus R$ 708,84; revisto em
  09/11) e somar a PRC
  como o BI (Domus R$ 90.000,00 vencidos em 27/03/2026). Valor da parcela continua
  `effectiveOpenAmount` (igual ao BI em todas em 07/11).
  2026: as 12 empresas iguais ao BI; painel com todas = R$ 4.712.138,42. **A página do BI
  só mostra 10 obras** (filtro fixo sem Silva Packer Construtora, Sul Brasil, Holding e
  Galpão Rua Canelinha; cita uma "RUA 2450" que não existe mais no Sienge) = R$ 4.143.614,48.
  Edielson: o painel continua abrindo com todas; o Carlos desmarca no filtro Empresas.
  Holding: regra antiga. Atrasadas e Pagas ainda na regra antiga.
- **Contas a Pagar › Contas em Atraso — conferido 08/11 (2º quadro):** card `Contas
  Atrasadas CARD` = saldo corrigido vencido (< hoje) > 0, sem PPC/PPE/PRC/PCT/PRV, sem olhar
  consistência, − imposto das mesmas linhas. Mesma lib (`entraNasAtrasadas`): a seleção é a do
  BI (passaram a contar 3 não consistidos: Domus R$ 5.635,40, Sul Brasil R$ 1.331,61, SP
  Construtora R$ 1.164,39 — mesma decisão do A Pagar; **revisto em 09/11: fora**). Os títulos 15596/15597 da TETRA
  (R$ 262.774,79) contam nos dois. **O valor da parcela NÃO segue o BI** (Edielson, 08/11):
  continua `effectiveOpenAmount`, conferido com o relatório do Sienge. O BI tira o imposto
  também de saldo parcial (R M FERNANDEZ, título 34134: imposto de R$ 21.497,05 já retido no
  pagamento de 06/03; BI R$ 18.493,41, Sienge/painel R$ 39.990,46) e ignora desconto (título
  33345, locação de R$ 9.900,00 com desconto de R$ 9.900,00; BI 9.900, painel 0). Diferença
  que fica: painel **+R$ 11.597,05 no 135 Jardins**; as outras empresas iguais ao BI. 08/11,
  todas: R$ 3.354.665,15 (221 parcelas); 2026: R$ 2.492.749,23 (151); 10 obras do BI em
  2026: R$ 1.312.974,64. A badge da aba e o card Contas Vencidas do Geral seguem a mesma
  lista. Holding: regra antiga.
- **Contas a Pagar › Contas Pagas — conferido 08/11 (3º quadro):** card `Total pago até data
  selecionada` = SUM(Líquido) por data da baixa de um CSV do relatório "Contas Pagas" do
  Sienge ("Ambos", período 2001–2040, exportado todo dia às 06:02 por robô para
  `SILVA PACKER/PAGAR/PAGAS CSV JANEIRO.csv.csv`, tabela `f_PAGAS CSV`), sem documento
  "TRAN.". A regra do painel (netAmount + movimentos bancários avulsos de saída, tipos de
  operação padrão) **já batia centavo a centavo nas 13 empresas em 2024 e 2025** e em 11 em
  2026. Mudou só uma coisa (`basePagas` em `a-pagar-regra.ts`): fora da Holding, os
  movimentos bancários avulsos entram só das empresas do modo — os da Holding vazavam no
  modo Silva Packer (2026: R$ 870.009,29; 2025: R$ 1.173.376,01). Orçamento e Comparativo
  continuam em `consistentItemsForPagas`; a aba Resumo (Total Pago) acompanhou. Ficam duas
  diferenças, ambas do BI: título 41035 (FEY PROBST, **NFSE** 413, 13/10/2026,
  R$ 14.546,75, Silva Packer Construtora — o único NFSE do Sienge; o CSV do BI não traz
  nenhum) e a consulta M do BI apaga a última linha do CSV (`RemoveLastN 1`; em 08/11,
  R$ 6.000,00 do Galpão). 2026 todas: **R$ 64.957.152,12** (BI sem Holding
  R$ 64.936.605,37); 10 obras do BI: R$ 50.392.060,29 nos dois. Holding: regra antiga.
- **Contas a Pagar › Geral a Pagar e Estimativa de Saídas — criados 09/11 (últimos quadros
  da página CONTAS À PAGAR do BI):** o painel não tinha esses cards (Edielson: "Criar os
  dois cards"). BI: `Geral a Pagar Ajustado CARD` = saldo corrigido de tudo em aberto sem
  PPC/PPE/PRV/PCT − imposto; `Estimativa Saidas no Periodo` = Total pago + Geral. No painel
  (`geralAPagar` e `estimativaSaidas` em `a-pagar-regra.ts`, trava `a-pagar-regra.test.ts`):
  **Geral = Total a Pagar + Contas em Atraso** (toda parcela aberta sem as previsões está
  em exatamente um dos dois), card "Geral a Pagar" na aba
  Contas a Pagar, logo depois do Total a Pagar; **Estimativa = Total Pago + Geral**, card
  "Estimativa de Saídas" na aba Contas Pagas. Mesmos filtros e valor de parcela das abas,
  só fora da Holding. Anos: com "Todos" aceso (todos ou nenhum marcado) o Geral é tudo em
  aberto, de qualquer vencimento (`semAno` em `applyFilters`), porque a aba A Pagar só tem
  botões do ano atual em diante; com anos marcados segue os anos dos dois cards. No
  estado inicial (2016–2026 marcados, só "2026" visível na aba A Pagar) o Geral é o A
  Pagar de 2026 + as atrasadas de 2016–2026 — os mesmos números das abas A Pagar e Contas em
  Atraso. A página do BI abre de 01/01/2016 a 31/12/2034 (= tudo, o nosso "Todos").
  Conferido com os dados de 08/11, vencimento em 2026, modo Silva Packer: BI
  R$ 6.623.474,77, painel R$ 6.635.071,82 (só a diferença do 135 Jardins, +R$ 11.597,05);
  Estimativa 2026 = R$ 71.592.223,94. Na tela em 09/11: Todos = Geral R$ 13.249.481,26 e
  Estimativa R$ 539.201.787,08. O painel **não copia** a exclusão fixa do BI no Geral
  (TETRA 15596 parc. 1–2, R$ 0,01 cada, e 15597 parc. 14, R$ 262.774,77, vencidas em
  2023/2025): ficam no Geral como ficam nas Atrasadas. Grade com 7 cards
  (`xl:grid-cols-4 2xl:grid-cols-7`) e fonte do valor menor com 7 cards ou com 6 e valor
  de 17+ caracteres (`fonteValor`). Página CONTAS À PAGAR do BI fechada.
- **Por que o Total a Pagar do BI difere do painel com "Todos" (09/11, pergunta do
  Edielson):** BI R$ 5.194.571,49 × painel R$ 4.875.069,78 (10 obras), −R$ 319.501,71,
  fechado no centavo com o mesmo dado: (1) **−R$ 582.276,50 = data**: o "Status
  Financeiro" do BI é coluna calculada com `TODAY()`, congelada na hora da atualização
  (sábado 07/11); as 20 parcelas que venceram em 07 e 08/11 são "a vencer" no BI e já
  estão em atraso no painel (09/11) — quase tudo é EURO SYSTEMAS, título 41627,
  R$ 534.235,65, 135 Jardins. Some quando o BI for atualizado. (2) **+R$ 262.774,79 =
  TETRA**: o card do BI é Geral − Atrasadas e só o Geral tira as 3 parcelas fixas da
  TETRA, então o BI mostra a TETRA com A Pagar NEGATIVO; no painel ela tem 0 a vencer.
  Geral e Atrasadas do BI (R$ 6.634.712,15 / R$ 1.440.140,67) também batem na conta. As
  barras "Valores por Empresa" do BI usam outra medida (`ValorTotalPagaveis`) e não
  somam o card do próprio BI (R$ 4.730.241,65). Nada mudou no painel.
- **Não consistidos fora, como o Sienge (Edielson, 09/11: "Tirar, como o Sienge"):** o
  relatório "Contas a Pagar (por Data de Vencimento) Sintético" do Sienge, 135 Jardins,
  09/11/2026 a 31/12/2050, deu A vencer R$ 1.662.470,27; o painel, R$ 1.739.050,27. A
  diferença era só o título 41760 (CHAVE DIGITAL, NFE, 3 parcelas, R$ 76.580,00), não
  consistido — conferido mês a mês com dado novo do Sienge (nov–ago iguais fora ele).
  Agora `consistido()` em `a-pagar-regra.ts` tira `consistencyStatus = "N"` do A Pagar,
  das Atrasadas e, por consequência, do Geral e da Estimativa (trava no teste). Saíram, na
  tela de 09/11 (dados de 08/11): A Pagar −R$ 77.288,84 (Chave Digital + Domus 41556,
  2 × R$ 354,42) e Atrasadas −R$ 8.131,40 (Domus 31604, Sul Brasil 23708, SP Construtora
  35266). Com isso o painel volta a ficar ABAIXO do
  Power BI nesses valores (o BI conta não consistido). Conferido local: 135 Jardins
  R$ 1.662.470,27 = Sienge; Todos: A Pagar R$ 9.804.971,61, Geral R$ 13.164.061,02.
- **Previsão de Comissão fora, como o Sienge (Edielson, 09/11, de novo "Tirar, como o
  Sienge"):** relatório do Sienge, Domus, 09/11/2026 a 31/12/2050: R$ 1.302.368,67; painel
  R$ 1.392.368,67. Todos os meses de nov/2026 a jul/2027 iguais no centavo; a diferença eram
  os títulos 35196 (Reserva Imob, R$ 82.500,00) e 35197 (Renata K, R$ 7.500,00), PRC
  vencidas em 27/03/2026, que o painel somava como o BI. O relatório do Sienge não traz
  documento de previsão (`forecastDocument = "S"`, que na Silva Packer são exatamente PPC,
  PPE, PRV, PCT e PRC). Agora `PREVISOES` em `a-pagar-regra.ts` tem as 5 e vale para A
  Pagar, Atrasadas e Geral; saiu a exceção da PRC no filtro Tipo Doc (`ignoraFiltroTipoDocCP`,
  painel e Calendário de Pagamentos). O painel fica R$ 90.000,00 abaixo do BI no Domus.
- **Contas Pagas do 135 Jardins conferido com o Sienge (Edielson, 09/11):** relatório "Contas
  Pagas (por Data) Sintético", 01/01/2001 a 09/11/2026: Líquido R$ 98.468.821,92; painel
  R$ 98.468.819,84. Os 72 meses iguais menos maio/2023 (−R$ 2,08): **tarifa do boleto de um
  título A RECEBER** (movimento bancário de saída, origem CR, histórico "Pag. tarifa bancária
  cobrança", 25/05/2023, título 312 "BOLETO TESTE"). Não é avulsa nem está no /outcome, e o
  relatório soma com "Tarifas bancárias ref. cobrança escritural" marcado. Agora
  `movimentosParaPagas` em `a-pagar-regra.ts` (trava no teste) junta aos avulsos essas tarifas,
  tiradas da lista completa de movimentos que o painel já baixa para o DRE
  (`allBankMovementsFull`); entram com `billId` = id do movimento, para não colidir com título a
  pagar. Na base toda são 3 (esta e 2 × R$ 2,07 do Palácio Elizabeth em 07/06/2023). Depois:
  135 Jardins = R$ 98.468.821,92, igual ao Sienge. Só no Painel; a tela avulsa Financeiro ›
  Contas Pagas (`contas-table.tsx`) segue a regra antiga. Margem direita do gráfico "Por
  Empresa" passou a ser calculada pelo maior rótulo (`margemRotuloEmpresa`); fixa em 80 px
  cortava o fim de valores com 16+ caracteres.
- **A Receber da Silva Packer Construtora × Sienge: aluguel fica fora, como o BI (Edielson,
  09/11: "Manter como o BI").** Relatório "Contas a Receber (por Data de Vencimento)" do
  Sienge, 09/11/2026 a 31/12/2050: R$ 2.530.053,02 (283 parcelas, 22 títulos); painel
  R$ 468.612,30. A diferença, R$ 2.061.440,72, é só aluguel (categoria 10513/10514: 18
  contratos de locação + acordo Bigliardi); o resto bate no centavo (títulos 298, 327 e o
  ressarcimento de IPTU 965). O Sienge soma aluguel, o painel segue a medida `Total a Receber
  Futuro` do BI. Com aluguel o modo Silva Packer iria de R$ 161.700.397,63 para
  R$ 164.616.235,74 (+ Sul Brasil R$ 854.397,39). Não mudar sem pedido. "Saldo atual" do
  relatório = `correctedBalanceAmount` (o título 298 é corrigido, +R$ 1.900,87 por parcela
  sobre o valor original).
  **Sul Brasil, mesma conferência (09/11):** Sienge R$ 1.917.665,55 (184 parcelas, 12 títulos)
  × painel R$ 1.063.268,16; a diferença, R$ 854.397,39, é só aluguel (10 contratos de
  locação); os 2 contratos de venda (títulos 196 e 190, Bella) batem no centavo, mês a mês.

## Indicadores › CUB-SC: mês novo direto do Sinduscon (Edielson, 09/11/2026)

- Pedido: "aqui tem que já aparecer CUB de novembro". O painel lia só o myside
  (série desde dez/2013), que em 09/11 ainda parava em Out/26; o Sinduscon da Grande
  Florianópolis já publicava o de novembro (sai até o dia 5).
- `fetchCubRows` (`src/lib/indicadores/cub-scraper.ts`) = série do myside +
  `lerCubSinduscon` (bloco **Residencial Médio** de `sinduscon-fpolis.org.br/servico/cub-mensal/`).
  O rótulo do mês é o **"Para ser usado em"** (mês de referência outubro = CUB de
  novembro), o mesmo do myside. `completarComSinduscon` só acrescenta quando o mês é
  mais novo que o último do myside; acumulado no ano = valor ÷ dez do ano anterior − 1,
  12 meses = ÷ mesmo mês do ano anterior − 1. Myside já com o mês → o número dele fica.
  Sinduscon fora do ar → série do myside, como antes. Trava: `cub-scraper.test.ts`.
- Nov/26 (09/11): R$ 3.182,95 · +0,35 % · ano 5,79 % · 12 m 5,99 % (= anúncio do Sinduscon).
- `/api/cub` (Orçamento: Orçado = m² × fator × CUB; Comercial; Empreendimentos) usa a
  mesma série. O cache de 7 dias só segura o mês corrente: com CUB de mês anterior busca
  de novo a cada 6 h (idem o "stale" do CUB na aba Indicadores, que busca sozinho ao abrir).
- **CUB manual = reserva quando o site atrasa (Edielson, 09/11: "deixa no automático, mas
  [...] a gente tem que poder inserir ele manualmente também").** Botão **Lançar CUB manual**
  na aba Indicadores › CUB (e o cartão de Cadastros › Empreendimentos): mês + valor; variação,
  acumulado e 12 meses são calculados pela série (os % digitados só entram sem base). Regra em
  `src/lib/indicadores/cub-manual.ts` (trava `cub-manual.test.ts`): o manual **só vale para um
  mês mais novo que o último automático**; quando o Sinduscon/myside publicam o mesmo mês, o
  automático volta sozinho e o manual fica guardado sem uso (a tela avisa e oferece remover).
  Antes o manual (`cub_override`) ganhava sempre — o lançado em 09/11 para Nov/26 tinha
  acumulado 5,65 % (o certo é 5,79 %) e prenderia o Orçamento em novembro. Vale em `/api/cub`
  (Orçamento/Comercial), na aba Indicadores (`getSerieCub` em `cub-serie.ts`; o "buscar de
  novo" olha só a série automática) e no resumo do MCP.

## Indicadores › Comparar: m² de Balneário Camboriú (Edielson, 06/11/2026)

- Pedido: "comparar o CUB-SC com o m² de Balneário Camboriú". A aba "Valor m²" só guarda
  uma foto por cidade (`indices_valor_m2`, myside), sem histórico — não serve para série.
- Fonte da série mensal: planilha pública do FipeZAP
  (`downloads.fipe.org.br/indices/fipezap/fipezap-serieshistoricas.xlsx`, ~4,6 MB, uma aba
  por cidade). Leitor em `src/lib/indicadores/fipezap-scraper.ts` (exceljs, import dinâmico):
  bloco "Imóveis residenciais › Venda", coluna Total de Número-índice, Var. mensal,
  Var. 12 meses e Preço médio (R$/m²). Variações vêm como fração (×100 ao gravar). Preço =
  média móvel trimestral (nota da Fipe). Dados de jan/2018 em diante.
- Tabela `indices_m2_bc` (ano, mes, indice, variacao_pct, acumulado_12m_pct, valor_m2),
  criada sob demanda (`ensureM2Bc` em `db.ts`) e no `schema.sql`. Sync:
  `POST /api/indicadores/sync {indicador:"m2bc"}` (automático quando a aba Indicadores abre
  e o dado tem mais de 7 dias ou não existe). `GET /api/indicadores` devolve `m2bc`.
- No Comparar é o slug `m2bc` ("m² Balneário Camboriú", rosa) em `INDICADORES_COMPARAVEIS`;
  entra pelo mesmo `pct[slug]` dos índices percentuais. O card mostra também o R$/m² do
  último mês. Conferido 06/11: 106 meses, out/26 = R$ 15.325/m², 12 m = +3,14 %.
- Outra cidade = chamar `fetchFipezapRows("Nome da aba")`; o leitor acha a aba sem acento.

## Controle de Orçamento por Empresa (Criado em 2026-04-16)

- Campo `controla_orcamento` (BOOLEAN) na tabela `company_settings` (default FALSE)
- Configurado em Cadastros > Empreendimentos (coluna "Controla Orçamento", badge Sim/Não)
- Só destaca em vermelho (bg-red-50 + border-red-300) as parcelas em Contas a Pagar/Vencidas/Pagas de empresas com `controlaOrcamento=true` que não têm Item de Orçamento vinculado
- A legenda clicável acima da tabela só aparece quando há parcelas destacadas (empresas controladas com buildingsCosts vazio/sem costEstimationSheetName)
- Clique na legenda aplica/limpa o filtro "(Sem item)" do Item Orçamento

## Contas a Pagar / Vencidas - Regra de Saldo (Validado em 2026-04-16)

### NAO ALTERAR sem pedido explicito do usuario:
- Coluna "Saldo" (A Pagar) e "Total" (Vencidas) em `src/components/contas-table.tsx`:
  - Fórmula: `correctedBalanceAmount - discountAmount - taxAmount` (só para outcome, isIncome=false)
  - `taxAmount` = imposto retido (ISS/INSS) que será deduzido do pagamento ao credor
  - Validado contra Sienge "Contas a Pagar (por Credor) Sintético" — coluna "Desconto" do relatório é o taxAmount
  - Campo `discountAmount` do /outcome é 0 para parcelas abertas — o ajuste real vem do taxAmount
- KPI card "Saldo Pendente" usa o mesmo cálculo via totalBalance
- Para Income (Contas a Receber/Recebidas) NÃO subtrair taxAmount (isIncome branch)

### Atualizacao 2026-05-09 - saldo parcial com imposto
- Regra implementada em `src/lib/dashboard-utils.ts` (`effectiveOpenAmount`):
  - Base: `correctedBalanceAmount - discountAmount`
  - Para outcome, `taxAmount` so e subtraido quando `originalAmount == correctedBalanceAmount` (parcela integralmente aberta)
  - Em saldo parcial, `taxAmount` pode pertencer ao titulo original e o Sienge "Contas a Pagar (por Credor) Sintetico" nao subtrai do saldo aberto
  - Validado no EDIFICIO 135 JARDINS vencidas ate 08/05/2026: PDF R$ 248.502,25 vs sistema R$ 248.502,26. Caso critico: R M FERNANDEZ bill 34134, saldo R$ 39.990,46, taxAmount R$ 21.497,05, PDF soma R$ 39.990,46.

## Contas Pagas - Regras Criticas (Validado em 2026-04-05)

### NAO ALTERAR sem pedido explicito do usuario:
- Formula do `paidTotal` em `src/components/contas-table.tsx`:
  - Valor liquido = `netAmount` (NAO subtrair taxAmount — taxAmount é imposto retido)
  - Tipos de operação excluídos são controlados pelo filtro UI "Tipo Operação" (não hardcoded)
  - Devoluções, Abatimentos e Por Bens ficam desmarcados por padrão no filtro
  - O filtro de Tipo Operação é salvo POR EMPRESA no localStorage
  - Bank movements avulsos (detachedOnly=S) são incluídos como parcelas extras
  - Bank movements de rendimento/aplicação/resgate são excluídos
- Coluna "Tipo Op." na tabela mostra o tipo de operação de cada pagamento
- O total deve bater com o relatório Sienge "Contas Pagas (por Data) Sintético" com:
  - Processar parcelas: Ambos (Contas a Pagar + Caixa/Bancos)
  - Tarifas bancárias ref. cobrança escritural: marcado

## Orçamento - Regras Criticas (Validado em 2026-04-02, alinhado com Contas Pagas em 2026-05-13)

### NAO ALTERAR sem pedido explicito do usuario:
- Formula do Realizado em `src/components/executive-dashboard.tsx` (budgetData useMemo):
  - Valor liquido = `netAmount` (NAO subtrair taxAmount)
  - Usa `consistentItemsForPagas` (inclui BMs avulsos sintetizados — mesma fonte da pagina Contas Pagas)
  - Exclusao hardcoded de documentos de previsao (PREVISÃO/PREVISAO)
  - Exclusao hardcoded de op types: Substituicao/Cancelamento/Abatimento/Devolucao/Por Bens/Permuta (mesmos defaults da pagina Contas Pagas)
  - Exclusao NAO depende de estado de filtros (sem race condition)
- Formula do Orcado: `areaM2 * factor * cubValue`
- Formula do A Realizar: `budget - realized`
- Formula do % Realizado: `(realized / budget) * 100`
- Ordenacao: empresas Finalizadas sempre no final
- **Cards do topo (Orçamento Total, Custo Realizado, Saldo a Realizar) somam só
  empresas/obras Ativas** (Edielson, 06/11/2026). As finalizadas (Tesla, Hannover)
  continuam na tabela, esmaecidas, mas fora dos três totais (`budgetTotals`).
  Saldo a Realizar segue sem contar saldo negativo. Trava: Test 13 de
  `src/__tests__/budget-calculations.test.ts`.
- **Coluna Área (m²)** (Edielson, 07/11/2026) entre Empreendimento e Fator: é o
  `areaM2` de Configurações › Empreendimentos, o mesmo que entra no Orçado
  (m² × fator × CUB). Só exibição e ordenação; não muda nenhum cálculo.
  Fica centralizada no meio do caminho entre o nome e o Fator (Edielson, 07/11):
  Empreendimento com `w-[1%] whitespace-nowrap` (abraça o nome mais longo) e a
  coluna Área com `w-[16%]` e texto ao centro. Sem rolagem lateral de 1366 px para cima.
- **% nos cards Custo Realizado e Saldo a Realizar** (Edielson, 07/11/2026): pílula
  discreta à direita da linha de baixo (`selo` do `CardPainel`), na cor do ponto do
  card, = total do card ÷ Orçamento Total (mesma base: só ativas) × 100, uma casa
  como a coluna % Real; a dica mostra duas casas. Sem saldo negativo os dois somam
  100 %. Na linha do rótulo cortava "Custo Realizado" a 1536 px, por isso fica embaixo;
  o texto do Saldo virou "só obras ativas, sem negativos" para caber a 1846 px.
  Trava: Test 14 de `budget-calculations.test.ts`.

## DRE - Regras Criticas (Validado em 2026-03-17)

### NAO ALTERAR sem pedido explicito do usuario:
- Formulas de calculo da DRE em `src/components/dre-tab.tsx` (lucroBruto, lucroOperacional, lucroLiquido, saldo, variacaoCaixa)
- Categorias negativas (NEGATIVE_CATEGORIES) em `src/components/dre-tab.tsx`
- Exclusao da empresa Holding nos fetches de DRE (`excludeCompanies=SILVA ADMINISTRADORA HOLDING LTDA`)
- Logica de parsing do Excel em `scripts/sync-excel-to-production.js`
- Funcoes getDreExcelData / saveDreExcelData em `src/lib/db.ts`
- Ordem e composicao das DRE_LINES
- Schema da tabela `dre_excel_supplementary` em `schema.sql`
- DRE mostra TODAS empresas (ignora filtro de empresa) para bater com Power BI
- 4 niveis de drill-down: Categoria > Conta Financeira > Credor/Cliente > Transações
- **Variação mês a mês do DRE Completo (Edielson, 07/11/2026):** em custo e despesa
  (`NEGATIVE_CATEGORIES`) o número mostra se o CUSTO subiu (+) ou caiu (−); a COR diz se
  foi bom (verde) ou ruim (vermelho) para o resultado. Custo variável jun→jul 2026 de
  −5.212.081,44 para −4.663.228,15 = "−10,5%" verde (antes "+10,5%"). Receita e linhas
  de lucro não mudaram. Regra em `src/lib/dre-variacao.ts` (trava
  `dre-variacao.test.ts`); só a exibição do %, nenhum valor do DRE passa por ela.
- **% da Receita no lugar dos Insights (Edielson, 09/11/2026: "o Carlos Humberto não usa
  isso"):** o painel "Insights da DRE" (frases automáticas) saiu de vez. A tabela da DRE
  Simples fica **central, com até 896 px** (`max-w-4xl mx-auto`, a largura que tinha ao
  lado dos Insights) — Edielson, 10/11/2026: na largura toda a conta ficava a ~1.300 px
  do valor e "a pessoa fica meio perdida na linha"; não voltar para `w-full` sozinho.
  Cards, botões e a DRE Completa seguem na largura toda. Coluna **% Receita** (análise vertical) na DRE Simples e
  **% Rec.** depois do Total na DRE Completa: linha ÷ Receita Operacional do período.
  Custo/despesa sem sinal (custo variável 84,5 %), linhas de lucro com sinal = margem, a
  mesma conta da pílula dos cards (−4,7 %). Conta aberta (nível 2) mostra também o % da
  receita (as contas somam o grupo); a parte dela dentro do grupo, que era o % mostrado
  até 09/11, foi para a dica. Regra em `src/lib/dre-analise-vertical.ts` (trava
  `dre-analise-vertical.test.ts`); só exibição, nenhum valor do DRE passa por ela.

Os valores da DRE foram validados contra o Power BI e batem 100%.

## Saldos Bancários - Regras (Validado em 2026-04-02, lista canônica revalidada em 2026-08-06)

### NAO ALTERAR sem pedido explicito do usuario:
- Mapeamento DimBanco (conta → banco) em `src/app/api/sienge/bank-accounts/route.ts`
  (`BANK_NAMES`) e cópia sincronizada em `src/lib/dimBanco.ts` (usada pelo cron + MCP)
- Mapeamento DIMBAN_ACCOUNT_COMPANY (conta → empresa/companyId) nos dois arquivos
- **Lista canônica = exatamente 17 contas** (relação da Cátia/Silva Packer, 2026-08-06):
  a tela de Saldos mostra por padrão SÓ essas 17 (as `isInDimBanco`); Cash/COFRE/
  aplicações internas/XP zerado ficam de fora. companyId TEM que casar com o
  `/accounts-balances` do Sienge, senão o preenchimento por cache não resolve
- Cuidado com o número real no Sienge: Caixa CC Sul Brasil é `5791519180` (SEM hífen),
  aplicações vêm com prefixo `A` (`A5026-3`, `A0241711-1`); BTG CARLOS/JOÃO são
  companyId 1 (Silva Packer) mesmo a Cátia listando sob "Sul Brasil"
- Serenity (`924-5`/comp10) e Rozza (`1241-6`/comp11) só vêm da API em dias alternados;
  o cache cobre os dias vazios — NÃO remover do mapa por parecerem "faltantes"
- Contas faltantes da API são preenchidas do cache PostgreSQL (cached_daily_balances)
- Seleção salva no localStorage `dashboard_saldos_accounts_v2` (o `_v2` reseta a
  seleção antiga quando a lista canônica muda); `REPORT_EXCLUDED_ACCOUNTS` vazio
  (o relatório MCP espelha a tela)
- Gráfico de evolução diária com cache no banco (dias passados não mudam)

## Resumo Financeiro - Regras (Criado em 2026-04-05)

- Total Pago usa filtro de Tipo Operação do próprio Resumo (não per-company)
- Total Recebido vem de income payments (netAmount > 0)
- Lucro Realizado = Total Recebido - Total Pago
- Coluna Disp. conta apartamento e sala comercial (exclui vagas e boxes) — desde
  09/11/2026 pelo TIPO do cadastro do Sienge (`contaNoEstoque` em
  `src/lib/estoque-resumo.ts`), não mais pelo nome; ver a seção seguinte
- Empresas Finalizadas sempre no final da tabela (case-insensitive)
- Status Ativa/Finalizada vem de Configurações > Empreendimentos

## Resumo › Estoque por unidade: modal editável (Edielson, 09/11/2026)

- Pedido: "o valor do estoque, ao clicar nele, abra um modal com a empresa filtrada e
  com todas as unidades disponíveis", com o valor de cada unidade editável em reais e
  a disponibilidade/reserva ajustável ali mesmo.
- Clicar em **Valor Estoque**, **Disp.** ou **Res.Téc.** de uma empresa abre o modal
  (`src/components/estoque-modal.tsx`): cartões (valor, disponíveis, reservadas, sem
  preço), filtros (Em estoque · Disponíveis · Reservadas · Vendidas e outras · Diferem
  do Sienge · Todas, tipo e busca) e, por unidade, tipo do Sienge, situação e preço.
  O digitado fica pendente e já simulado nos cartões até **Salvar**.
- **Regra única** em `src/lib/estoque-resumo.ts` (trava `estoque-resumo.test.ts`), usada
  pela tabela do Resumo e pelo modal — o total do modal é o número da coluna.
  - Situação em camadas: **manual** (posta no modal) > **tabela comercial** do
    empreendimento > **Sienge**. É a mesma do Quadro Espelho (`aplicarSituacaoManual`
    em `comercial-view.tsx`); a Tabela de Preços mostra a etiqueta "(manual)".
  - Valor da unidade Disponível: preço da **Tabela de Preços** do painel; sem ele, o da
    tabela comercial; sem nenhum, a estimativa de sempre (área × fator × CUB).
  - **Apartamento e sala comercial** contam em Disp./Res.Téc. e são estimados; vaga,
    box e o resto ficam fora da conta e só somam no valor quando têm preço.
  - Reservada não soma no Valor Estoque (como antes).
- Onde grava (nada vai para o Sienge): preço → `tabela_precos_unidades` pela rota
  `/api/tabela-precos` (com histórico); situação → tabela nova `situacao_manual_unidades`
  (`ensureSituacaoManual` em `db.ts`, nasce na 1ª chamada) pela rota
  `/api/situacao-unidades`. "Sienge/Tabela comercial · X" no seletor apaga o ajuste.
  Editam os **administradores** e quem está em `TABELA_PRECOS_EMAILS`; os demais só veem.
- 1ª publicação (commit `ea71d89`): sem preço, tabela comercial nem ajuste manual os
  números eram os de antes — conferido local com os fatores de produção, iguais à tela
  de produção de 09/11 (135 Jardins R$ 4.019.805,17 e 18/3, Tesla R$ 954.885,00 e 21…).
- **Palácio Elizabeth mudou**: de R$ 10.496.599,46 / 82 disp. para **R$ 55.600.000,00 /
  12 disp.**, porque o Resumo passou a seguir a tabela comercial (12 à venda, com preço).
  As 3102 e 3202 (R$ 10,2 mi) entram por estarem na tabela comercial; no Sienge são
  permuta de R$ 0,01 em nome de João Paulo e Carlos Humberto. 1501, 1502 e 1801 estão
  livres no Sienge e fora da tabela comercial (contam como vendidas). Tudo ajustável no modal.
- **Só apartamentos (Edielson, 09/11: "Sim, só apartamentos").** A regra olhava o NOME
  e a vaga se chama "G 108" no Sienge, então vaga contava como apartamento e era
  estimada por m² (os 82 do Palácio eram 13 apartamentos + 69 vagas). Agora vale o tipo
  do cadastro (`ehApartamento`: "Apartamento" e "Apartamento (Permuta)"; sem tipo, o
  nome). Antes → depois, com os dados de 08/11 e os fatores de produção:
  135 Jardins R$ 4.019.805,17 (18 disp./3 res.) → **R$ 2.537.797,86 (3/2)** ·
  Rozza R$ 381.954,00 (8) → **sem valor (1; a 901 está com área zero no Sienge)** ·
  Serenity R$ 4.653.472,90 (5/6) → **igual (5/2)** · Tesla R$ 954.885,00 (21) →
  **nada (só vagas, salas e boxes)** · Capri R$ 1.193.415,27 (8) → **R$ 862.388,47 (1)** ·
  Siena R$ 3.985.530,84 (23) → **R$ 2.628.416,45 (6)** · Hannover R$ 2.233.065,41 (16) →
  **R$ 1.501.413,43 (3)** · Palácio igual (R$ 55.600.000,00, 12). Vaga, sala e box
  voltam ao valor quando alguém cadastrar o preço no modal.
  O "VGV potencial" e a área do **Comercial › Visão Geral** usam a mesma função (era
  uma cópia da regra do nome): 6.045 m² em 09/11.
- **Salas comerciais também são estoque (Edielson, 09/11: "além dos apartamentos, têm
  salas comerciais que elas devem contabilizar como estoque").** `contaNoEstoque` =
  grupo "Apartamento" ou "Sala comercial" do `grupoDoTipo` ("Salas Comerciais", "Sala
  Comercial (Permuta)" e loja; sem tipo, o nome com SALA/SL/LOJA/LJ). A sala conta em
  Disp./Res.Téc. e, sem preço, soma área × fator × CUB como o apartamento; o VGV
  potencial do Comercial também. `ehApartamento` segue existindo (só apartamento).
  No Sienge em 09/11: 20 salas disponíveis passam a contar — 135 Jardins 6, Esquina
  Bella 4, Siena 4, Tesla 3, Hannover 2 e 1 sala de permuta da Silva ADM (Palácio e
  Capri têm 5 cada, todas vendidas; Rua 2870 tem 3 em proposta). Trava:
  `estoque-resumo.test.ts`. O cartão "Disponíveis" do modal mostra a composição
  ("3 apartamentos · 2 salas comerciais") e "Sem preço" vale para os dois tipos.
- **Administradores editam (Edielson, 09/11: "todos os usuários admin tenham que poder
  mudar ali os valores e editar").** O painel não tinha papel de administrador. Agora a
  sessão leva `admin` (`src/lib/auth.ts`): o login "Administrador" (`ADMIN_USERNAME`)
  e quem chega do Portal com `role: "admin"` no bilhete (`validarBilhetePortal`, trava
  `portal-sso.test.ts`). `podeEditarNaSessao` em `src/app/api/tabela-precos/acesso.ts`
  = administrador OU `TABELA_PRECOS_EMAILS`; vale para estoque do Resumo, Tabela de
  Preços, tabela comercial, condições de pagamento e andamento da obra.
  **Portal manda o papel desde 09/11/2026** (`portal-silva-packer`, commit `bbc0232`,
  serviço `portal` no EasyPanel): `emitirBilhete` assina `role` sempre como "admin" ou
  "user" (`session.user.role` do Portal; ausente conta como "user"). Quem já estava
  logado no Financeiro precisa abrir de novo pelo card do Portal (bilhete novo = sessão
  nova) para a edição liberar. Mudança no Portal se faz em sessão na pasta dele, não daqui.
- **Sala só no painel (Edielson, 09/11: "pode ser que algumas salas não estejam
  cadastradas no Sienge. Elas podem ser somente aqui pelo painel").** Botão **Adicionar
  sala** no modal do Estoque (quem edita: admin ou `TABELA_PRECOS_EMAILS`). Grava na
  tabela `unidades_painel` (`ensureUnidadesPainel` em `src/lib/db.ts`; campos empresa,
  empreendimento, enterprise_id, unidade, tipo Sala comercial/Loja, área, situação
  Disponível/Reservado/Vendido, preço). Rota `/api/unidades-painel` (GET lista +
  `podeEditar`; POST cria; PUT `{itens:[{id,...}]}` altera; DELETE `?id=` **arquiva**
  com `removido_em`/`removido_por`, nunca apaga). Nada vai para o Sienge.
  - Entra no estoque como `ApiUnit` com **id negativo** (`-id`), via `unidadesComPainel`
    e `precosComPainel` (`src/lib/unidades-painel.ts`). Situação e preço são os do
    cadastro dela (origem "painel"); a tabela comercial não mexe nela. Conta no
    Resumo (Valor Estoque, Disp., Res.Téc., Lucro potencial), no modal e no VGV
    potencial do Comercial › Visão Geral. Quadro Espelho e Tabela de Preços **não**
    mostram (lá é só Sienge).
  - **Duplicada:** mesmo empreendimento (enterpriseId, ou nome se não houver) e mesmo
    nome por `chaveDoNome` (maiúsculas, sem acento, sem zero à esquerda: "Sala 1" =
    "SALA 01") → a do Sienge vale, a do painel sai da conta e o modal mostra aviso com
    "Tirar a do painel". O formulário já bloqueia cadastrar nome que existe no Sienge
    ou repetido no painel; o servidor bloqueia repetida no painel (409).
  - Venda de verdade (contrato, recebíveis) continua exigindo a unidade no Sienge:
    cadastrar lá com o mesmo nome e a do painel cai sozinha.
  - Trava: `src/__tests__/unidades-painel.test.ts`. Teste local de 09/11 (banco
    `spapi-sp-db`): cadastrar SALA 08 com R$ 450.000,00 levou o 135 Jardins de
    R$ 5.014.312,64 / 9 disp. para R$ 5.464.312,64 / 10 disp.; reservar tirou do
    valor; "Sala 1" duplicada da SALA 01 não contou e mostrou o aviso; leitor recebe 403.
- `InputReais` saiu de `tabela-precos-view.tsx` para `src/components/input-reais.tsx`
  (compartilhado). `/api/situacao-unidades` ainda não está no MCP.

## Visão Geral - Regras (Criado em 2026-04-01)

- Aba padrão ao abrir o Painel Executivo
- Saldo Bancário carregado junto com a Visão Geral (não só na aba Saldos)
- Fluxo de Caixa Projetado: saldo atual + recebimentos previstos - pagamentos previstos
- Período selecionável: 30d, 60d, 90d, 4m, 6m, 1a
- Dois modos de gráfico: Projetado (área) e Entradas x Saídas (barras + linha)
- Insight cards: Ponto Crítico, Cobertura de Caixa, Saldo projetado no final

## Filtros por Aba

- **Nenhuma aba herda filtro de outra (Edielson, 10/11/2026: "cada aba tem que ser
  individual, sem herdar nada dos filtros das anteriores").** Grupo = `getTabGroup`:
  CP (a-pagar, pagas, atrasadas, calendário de pagamento) e CR (a-receber, recebidas,
  inadimplência, calendário de recebimento) dividem filtro dentro do grupo; Geral,
  Orçamento, DRE, Saldos, Resumo, Indicadores e Comparativo são um grupo cada.
- Aba já aberta nesta visita ao Painel volta como foi deixada (`perTabCompanies` +
  `perTabFilters`: empresas, anos, meses, dias, tipo doc, tipo operação, nº documento,
  vencimento e empresa clicada). Aba aberta pela 1ª vez abre no PADRÃO DELA
  (`aplicarPadraoDaAba`, via `padraoPendente`, só depois da carga completa): o "Salvar
  padrão" daquela aba (`dashboard_<filtro>_<grupo>`, só valores que existem nos dados
  da seção), senão o padrão do painel = obras (sem holding/administradora/construtora/
  empreendimentos/galpão), tipos de documento sem previsão, últimos 10 anos + o atual,
  tipos de operação sem `OP_TYPES_FORA_DO_PADRAO`, sem mês/dia/vencimento/clique. O X
  da barra de filtros faz o mesmo. As chaves globais antigas `dashboard_default_*` não
  são mais lidas pelo Painel (o Comercial ainda lê `dashboard_default_years`).
- **Resumo** (`resumo_v2` nas chaves salvas, padrão salvo antes de 10/11 não vale):
  abre para todo mundo com as 10 obras, os 26 tipos de documento e os 11 anos. Antes,
  aberto depois do CR, ficava com os 7 tipos de documento do CR: Total Pago do 135
  Jardins R$ 38.480.600,27 em vez de R$ 98.581.904,25 (local, dados de 08/11).
- **Movimento Bancário sempre no padrão:** antes o tipo de operação era montado quando
  o CP chegava, antes dos movimentos bancários, e numa carga do zero o "Movimento
  Bancário" ficava de fora — o Total Pago perdia os avulsos (135 Jardins: −R$ 1.281,14
  = Aviso de Lançamento 1.253,98 + Taxa 25,08 + tarifa de boleto 2,08). Agora o padrão
  só entra com a carga completa.
- Conferido em 10/11 com Playwright local (CP com anos mexidos → Resumo; CR → Resumo;
  volta ao CP mantém os anos dele; X volta ao padrão). Não há teste automático no repo.

## Autenticação

- Administrador (09/11/2026): `session.user.admin` = login "Administrador" ou bilhete do
  Portal com `role: "admin"`. Ver "Resumo › Estoque por unidade".
- NextAuth com dois providers: Google OAuth + Credentials
- Credentials: verifica env vars (ADMIN_USERNAME/PASSWORD) depois banco PostgreSQL (tabela users)
- Senhas em bcrypt hash
- Usuários criados via script: `node scripts/seed-user.js "Nome" "email" "senha"`
- Seed automático no migrate.js para usuários padrão

## Dark Mode

- next-themes com classe "dark" no HTML
- Botão sol/lua no header para alternar
- Vermelho suave no dark: `dark:text-red-300/60` ou `dark:text-red-300/70`
- SVG charts usam #f87171 (red-400) em vez de #ef4444/#dc2626

## Stack
- Next.js 14 (App Router) + TypeScript
- PostgreSQL (Railway production)
- Tailwind CSS + shadcn/ui
- Sienge API para dados financeiros (outcome, income, bank-movements, accounts-balances, companies, units, sales-contracts)
- Excel como fonte primaria para DRE (sync diario via Task Scheduler)
- next-themes para dark mode
- bcryptjs para hash de senhas
- Recharts para gráficos (BarChart, AreaChart, ComposedChart, LineChart)
