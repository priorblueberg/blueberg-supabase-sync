

# Adicionar coluna `engine` na tabela `produtos` para roteamento explícito de motores de cálculo

## Objetivo

Tornar explícita, via configuração no banco, qual engine de cálculo cada produto de Renda Fixa utiliza — preparando a arquitetura para futuras engines (amortização programada, cronogramas customizados, etc.) sem hardcoding por nome de produto.

## Decisões de design

1. **Onde mora a coluna**: na tabela `produtos` (e não em `custodia`). Justificativa: a engine é uma característica intrínseca do produto financeiro, não de cada posição. Todos os títulos de um mesmo produto compartilham a mesma engine.

2. **Tipo da coluna**: `text` (não enum Postgres). Motivo: enums Postgres exigem migration toda vez que se adiciona uma engine nova; `text` validado por uma constante TypeScript central (`ENGINE_IDS`) é mais escalável e já é o padrão do projeto (ver `categoria_nome`, `modalidade`).

3. **Convenção central no front**: criar `src/lib/engines/registry.ts` com:
   - `type EngineId = "CDBLIKE" | "POUPANCA" | "CAMBIO"` (tipos já existentes recebem id explícito)
   - constante `ENGINE_IDS` para validação
   - função `resolveEngine(produto)` que lê `produto.engine`, faz o dispatch e trata o caso `null` com erro claro ("produto sem engine configurada — verifique cadastro").

4. **Retrocompatibilidade**: a migration popula `engine = 'CDBLIKE'` para os 13 produtos listados (CDB, CDCA, DPGE, LC, LCA, LCI, LCD, LF, LFS, LFSN, LIG, RDB, RDC). Poupança recebe `POUPANCA`, Dólar/Euro recebem `CAMBIO`. Nenhuma lógica de cálculo muda — apenas o **caminho de decisão** (antes: `categoria_nome === "Renda Fixa" && modalidade !== "Poupança"`, depois: `produto.engine === "CDBLIKE"`).

5. **Tratamento de produto sem engine**: se `engine = null`, o produto é ignorado nos loops de cálculo (não cai em fallback silencioso) e um `console.warn` é emitido. Na página de Análise Individual, mostra mensagem "Engine não configurada para este produto".

## Mudanças no banco (migration)

```sql
ALTER TABLE produtos ADD COLUMN engine text;

-- Renda Fixa "CDB-like"
UPDATE produtos SET engine = 'CDBLIKE'
WHERE nome IN ('CDB','CDCA','DPGE','LC','LCA','LCI','LCD','LF','LFS','LFSN','LIG','RDB','RDC');

-- Poupança e Câmbio (preservam comportamento atual)
UPDATE produtos SET engine = 'POUPANCA' WHERE nome ILIKE 'Poupança';
UPDATE produtos SET engine = 'CAMBIO'   WHERE nome ILIKE ANY (ARRAY['Dólar','Dolar','Euro']);
```

Após migration, regenerar `src/integrations/supabase/types.ts` (automático).

## Mudanças no código

### Novo arquivo
- **`src/lib/engines/registry.ts`** — constantes `ENGINE_IDS`, tipo `EngineId`, helper `getEngineId(produto)` e `isEngine(produto, id)`.

### Propagar `engine` no carregamento
- **`src/lib/dataCache.ts`**: adicionar `engine: string | null` em `CustodiaRecord`; incluir `produtos(nome, engine)` no SELECT (linha 244) e mapear `engine: r.produtos?.engine ?? null` (próximo à linha 260).

### Substituir filtros por nome/categoria pelo dispatch por engine
Locais onde hoje se decide o motor por `categoria_nome`/`modalidade`:
- **`src/pages/PosicaoConsolidadaPage.tsx`** (linhas ~175-178): trocar
  ```ts
  const rfProducts = ... categoria_nome === "Renda Fixa" && modalidade !== "Poupança"
  const poupancaProducts = ... modalidade === "Poupança"
  const cambioProducts = ... categoria_nome === "Moedas"
  ```
  por filtros via `getEngineId(p) === "CDBLIKE" | "POUPANCA" | "CAMBIO"`.
- **`src/pages/AnaliseIndividualPage.tsx`** (linhas ~80-88): a flag `isPrefixado/isPoupanca/isMoedas/hasEngine` passa a ler `getEngineId(product)`.
- **`src/pages/ProventosRecebidosPage.tsx`** (linhas ~99-104): mesma troca.
- **`src/pages/CarteiraRendaFixaPage.tsx`**, **`CarteiraCambioPage.tsx`**, **`CalculadoraPage.tsx`**: idem nos pontos onde filtram produtos antes de chamar a engine.

### Manter intocado
- `rendaFixaEngine.ts`, `poupancaEngine.ts`, `cambioEngine.ts`: nenhuma alteração interna. A lógica de cálculo permanece exatamente como está. Só muda **quem chama qual engine**.
- `engineCache.ts`: nenhuma mudança (cache continua keyed por `codigo_custodia`).

### Cadastro de produto (futuro, opcional nesta etapa)
- `src/pages/CadastroPage.tsx` / formulário de produtos: adicionar dropdown "Engine de cálculo" com as opções de `ENGINE_IDS` ao criar/editar produto. **Decisão**: incluído nesta entrega como campo opcional para admin no formulário de produtos.

## Diagrama do fluxo

```text
                  ┌─────────────────────┐
                  │ produto.engine (DB) │
                  └──────────┬──────────┘
                             ▼
                  ┌─────────────────────┐
                  │ getEngineId(produto)│ ◄── src/lib/engines/registry.ts
                  └──────────┬──────────┘
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
         "CDBLIKE"      "POUPANCA"       "CAMBIO"
              │              │              │
              ▼              ▼              ▼
   calcularRendaFixa   calcularPoup.   calcularCambio
   Diario()            Diario()         Diario()
```

## Checklist de validação pós-implementação

- Migration roda e popula os 13 produtos `CDBLIKE` + Poupança + Dólar/Euro.
- `produto.engine` chega populado em todas as páginas (validar no console).
- Posição Consolidada, Carteira de Renda Fixa, Análise Individual e Proventos continuam mostrando os mesmos números de antes (retrocompatibilidade total).
- Produto novo cadastrado sem `engine` é ignorado nos cálculos com warning no console (não quebra a UI).

## Tarefas (ordem de execução em modo default)

1. Migration: `ALTER TABLE` + `UPDATE` populando engines existentes.
2. Criar `src/lib/engines/registry.ts`.
3. Estender `CustodiaRecord` e SELECT em `dataCache.ts`.
4. Substituir filtros por engine em PosicaoConsolidada, AnaliseIndividual, Proventos, CarteiraRendaFixa, CarteiraCambio, Calculadora.
5. Adicionar dropdown "Engine" no cadastro de produtos.
6. Smoke test: comparar valores de uma posição RF, Poupança e Dólar antes/depois.

