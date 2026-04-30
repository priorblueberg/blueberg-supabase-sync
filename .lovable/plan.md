
## Objetivo

Criar a nova página **Controle de Gastos** acessível pelo menu vertical, replicando a estrutura visual do mockup enviado. Nesta etapa, **sem qualquer integração com o banco** — toda a página usará dados mockados em memória.

## Escopo

1. **Menu lateral** (`src/components/AppSidebar.tsx`)
   - Adicionar novo item `"Controle de Gastos"` com ícone `Wallet` (lucide-react), apontando para `/controle-gastos`.
   - Posicionar logo abaixo de "Proventos Recebidos".
   - Sem `adminOnly` (visível para todos).

2. **Rota** (`src/App.tsx`)
   - Importar `ControleGastosPage` via `lazy()`.
   - Registrar `<Route path="/controle-gastos" element={<ControleGastosPage />} />` dentro do bloco protegido (`AppLayout`).

3. **Nova página** (`src/pages/ControleGastosPage.tsx`)
   Replicar a estrutura do mockup, usando os componentes já existentes do projeto (`Card`, `Table`, `recharts`) e o tema atual (claro com acentos azuis — sem forçar tema escuro, manter consistência com o restante do app).

   Seções, de cima para baixo:

   a) **Cabeçalho**
      - Título: "Balanço de Despesas"
      - Badge à direita com período (ex: `PERÍODO • 01.JAN.2026 → 04.2026 • YTD`).

   b) **Linha de KPIs** (3 cards lado a lado)
      - **Total Consumo Acumulado** — valor grande, label de apoio "Acumulado de janeiro a abril".
      - **Média Mensal** — valor + label "Média de 4 meses".
      - **Mês de Pico** — valor + label do mês (ex: "Março").

   c) **Despesas Mensais** (card com gráfico)
      - `BarChart` (recharts) com 12 meses (jan–dez), valores mockados apenas para os 4 primeiros meses, demais zerados/cinza.
      - Linha tracejada horizontal mostrando "Média acumulada".
      - Legenda: "Total Mensal", "Média Acumulada", "Projeção".

   d) **Detalhamento por Categoria** (card com tabela)
      - Colunas: índice (#), categoria, barra de progresso proporcional, %, valor.
      - Mock com ~11 categorias (Outros, Compras, Saúde, Alimentação, Contas da Casa, Lazer, Assinaturas, Educação, Automóvel, Transporte, Despesas Financeiras).
      - Linha clicável (chevron à direita) — sem ação real nesta etapa.
      - Texto "CLIQUE PARA EXPANDIR" no header.

   e) **Movimentações Segregadas** (card com tabela agrupada)
      - Badge à direita: "NÃO CONTABILIZADAS NO TOTAL".
      - Agrupamento por conta (ex: "Conta Maurício") com total à direita.
      - Linhas filhas: data, descrição, badge categoria, valor.
      - Mock com 1 grupo e 3 movimentações.

4. **Dados mockados**
   - Constantes locais no topo do arquivo (`MOCK_KPIS`, `MOCK_MONTHLY`, `MOCK_CATEGORIAS`, `MOCK_SEGREGADAS`).
   - Sem chamadas a `supabase`, sem hooks de dados.

5. **Formatação**
   - Reutilizar helper local `fmtBrl` (mesmo padrão das outras páginas: `Intl` pt-BR, BRL).
   - Datas em pt-BR.

## Detalhes técnicos

- **Tema**: o app é claro (ver `src/index.css`); a página seguirá o tema claro padrão usando `Card`, `bg-card`, `text-foreground`, `text-muted-foreground` e `--primary` para acentos. O mockup escuro serve apenas como referência de **layout e hierarquia**, não de cores. (Se desejar tema escuro só nesta página, posso ajustar em iteração seguinte.)
- **Ícone do menu**: `Wallet` de `lucide-react` (já usado no projeto pela família lucide).
- **Gráfico**: `BarChart` + `ReferenceLine` do recharts (mesmo padrão de `ProventosRecebidosPage`).
- **Sem alterações** em: `SubTabs`, contextos, engines, helpers de IPCA/CDB, ou qualquer arquivo de cálculo.
- **Sem migrações** de banco.

## Arquivos afetados

- editar `src/components/AppSidebar.tsx` — adicionar item de menu
- editar `src/App.tsx` — registrar rota lazy
- criar `src/pages/ControleGastosPage.tsx` — nova página com mock

## Resultado esperado

- Novo item "Controle de Gastos" aparece no menu lateral.
- Ao clicar, abre a página `/controle-gastos` com layout fiel ao mockup (KPIs, gráfico mensal, tabela de categorias, movimentações segregadas), tudo populado por dados estáticos.
- Nenhuma página existente é afetada; nenhuma chamada ao backend é feita.
