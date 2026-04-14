

## Redesign da Página de Proventos (/proventos)

### Resumo das mudanças

Reescrever a página de Proventos com 6 alterações conforme o documento:

### 1. Data de referência fixa em D-1 (desligada do seletor)

A página calculará sua própria `dataRef = D-1` (ontem) ao invés de usar `dataReferenciaISO` do contexto. O `useEffect` não dependerá mais de `appliedVersion` / `dataReferenciaISO`. A data será exibida no cabeçalho: **"Data de Referência: 13/04/2026"**.

### 2. Todos os produtos RF com tipo "Rendimentos"

- Remover o filtro `c.pagamento` que hoje restringe a apenas produtos com pagamento periódico. Incluir **todos** os produtos de Renda Fixa (incluindo "No Vencimento").
- Alterar o tipo de `"Pagamento de Juros"` para `"Rendimentos"` para todos os produtos RF.
- Poupança já usa `"Rendimento"` — será equalizado para `"Rendimentos"` (plural).

### 3. Bloco "Resumo (Últimos 12 meses)"

- Calcular janela de 12 meses fechados a partir do mês atual. Ex: se D-1 = 13/04/2026, janela = 01/05/2025 a 30/04/2026.
- **Card à esquerda**: total por tipo de provento + total geral nos 12 meses.
- **Gráfico de barras à direita**: barras empilhadas mensais (Mai/2025 a Abr/2026), usando `recharts` (BarChart + Bar stacked). Cada "stack" é um tipo de provento.

### 4. Remover tabela de totais

A tabela "Tipo / Total" que existe hoje será removida (substituída pelo bloco de resumo acima).

### 5. Dois filtros combinados

- Filtro por **Ativo** (select com todos os nomes).
- Filtro por **Tipo de Provento** (select com tipos únicos).
- Ambos filtram em conjunto (AND).

### 6. Paginação + ordenação padrão

- Ordenação padrão: data decrescente (mais novo primeiro) — já é o default.
- Paginação de 10 itens por página.
- Navegação com setas esquerda/direita + indicador "Página X de Y".

---

### Detalhes técnicos

**Arquivo editado:** `src/pages/ProventosRecebidosPage.tsx`

**Dependências:** `recharts` (já instalado), `date-fns` (já usado no projeto via `subDays`, `format`).

**Estrutura do componente:**

```text
┌─ Header ──────────────────────────────────────────────┐
│ Proventos Recebidos           Data de Referência: D-1 │
│ Pagamentos e rendimentos dos seus títulos             │
├─ Resumo (Últimos 12 meses) ──────────────────────────┤
│ ┌─Card─────────┐  ┌─Gráfico barras empilhadas──────┐ │
│ │ Rendimentos  │  │  ████                           │ │
│ │ R$ XX.XXX    │  │  ████  ██                       │ │
│ │              │  │  ████  ██  ██                   │ │
│ │ Total        │  │  Mai  Jun  Jul ... Abr          │ │
│ │ R$ XX.XXX    │  └─────────────────────────────────┘ │
│ └──────────────┘                                      │
├─ Extrato ────────────────── Filtros: [Ativo] [Tipo] ─┤
│ Data │ Nome │ Tipo │ Valor Recebido                   │
│ ...  │ ...  │ ...  │ ...                              │
│                        Página 1 de 10   ◄ ►           │
└───────────────────────────────────────────────────────┘
```

**Lógica de dados:**
- `dataRef = format(subDays(new Date(), 1), "yyyy-MM-dd")` — fixo, calculado uma vez.
- Incluir TODOS os produtos RF (não filtrar por `c.pagamento`). Para produtos sem pagamento periódico, o engine já calcula `pagamentoJuros` no `isFinalDay`.
- Tipo unificado: `"Rendimentos"` para RF e Poupança.
- Janela 12 meses: mês atual completo + 11 meses anteriores. Filtrar `rows` por data dentro da janela para o resumo. A lista de extrato mostra TODOS os proventos.

**Gráfico:** `BarChart` com `Bar` empilhadas (`stackId="a"`), eixo X = meses (Mai/2025...Abr/2026), cores distintas por tipo.

**Paginação:** State `page` com 10 itens/página, `Math.ceil(filteredRows.length / 10)` total de páginas.

