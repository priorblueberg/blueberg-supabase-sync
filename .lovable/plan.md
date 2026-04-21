

## Diagnóstico

Pela rede capturada, a query `GET /calendario_ipca?competencia=gte.2023-11-01&lte.2026-06-01` voltou `[]`. Se a tabela está preenchida no banco, o problema é de **filtro/RLS/permissão de leitura**, não de dado. Sem registros no client, o helper cai no fallback `variacaoMensal = 0` → multiplicador diário = 1 → como a taxa do título é 0%, `dailyMult = 1 * 1 - 1 = 0` todo dia.

Sobre a regra "taxa = 0 ⇒ 100% IPCA sem taxa adicional": a fórmula atual já faz isso matematicamente. Com `taxa=0`, `ipcaTaxaRealFactor = (1+0)^(1/252) = 1`, então `dailyMult = ipcaFator - 1`, ou seja, exatamente 100% do IPCA. **O bug real é que `ipcaFator` está vindo 1 porque a leitura de `calendario_ipca` retorna vazia.**

## Plano

### 1. Diagnosticar a leitura de `calendario_ipca`

- Rodar `SELECT count(*), min(competencia), max(competencia) FROM calendario_ipca` para confirmar volume e cobertura.
- Verificar **RLS** da tabela: se houver policy exigindo `user_id = auth.uid()` e os dados forem globais (sem `user_id`), nenhum usuário enxerga. Para tabela de referência de mercado, a policy correta é `SELECT` liberado para `authenticated`.
- Conferir o range de filtro do helper vs. competências reais (formato `YYYY-MM-01` ok).

### 2. Corrigir o acesso

Dependendo do achado:
- **Se RLS bloqueia**: criar migration ajustando a policy de `calendario_ipca` para permitir SELECT a qualquer usuário autenticado (dados públicos de mercado).
- **Se faltam competências** (ex.: faltam meses do período do título 2024-01..2025-12): seed/import dos meses faltantes.
- **Se filtro do helper exclui registros**: ajustar `fetchCalendarioIpca` (improvável — o range já tem ±2 meses de folga).

### 3. Tornar visível quando IPCA está faltando

No helper `getRegistroIpcaDaCompetencia`, quando cair no fallback `0%`, emitir `console.warn` único por competência ausente (`[IPCA] competência YYYY-MM ausente — usando 0%`). Isso evita que o mesmo sintoma volte silenciosamente no futuro.

### 4. Confirmar a regra "taxa 0 ⇒ 100% IPCA"

Manter a fórmula atual em `rendaFixaEngine.ts`:
```
ipcaTaxaRealFactor = (1 + taxa/100)^(1/252)
dailyMult = ipcaFator * ipcaTaxaRealFactor - 1
```
Com `taxa=0` isso já entrega exatamente o IPCA do dia. Nenhuma alteração de fórmula é necessária — só validar via QA depois do dado voltar.

### 5. Forçar recálculo

Bump de versão em `engineCache.ts` para invalidar resultados em cache (`v6-ipca-competencia-fim` → `v7-ipca-fix-leitura`) e re-render da Calculadora/Posição Consolidada.

## QA pós-correção

- Abrir o título "CDB Banco Andbank Brasil IPCA + 0,00%" na Calculadora.
- Conferir que a coluna **Tipo Taxa** alterna entre `Projetada` e `IPCA` ao longo dos meses.
- Conferir que a coluna **% IPCA mês** mostra a variação real da competência vigente (não 0%).
- Conferir que a **Rentabilidade Acumulada** ≈ IPCA acumulado do período (sem spread).
- Conferir que CDI e Prefixado continuam idênticos (sem regressão).

## Detalhes técnicos

- Arquivos tocados: migration SQL para policy de `calendario_ipca` (se for o caso), `src/lib/ipcaHelper.ts` (warn de competência ausente), `src/lib/engineCache.ts` (bump de versão).
- Escopo isolado a CDBLIKE + IPCA — CDI e Prefixado intactos.
- A regra de taxa zero não exige mudança de código: já é consequência direta de `(1+0)^(1/252) = 1`.

## Pergunta antes de implementar

Para escolher a correção certa do passo 2, preciso confirmar **uma coisa**:

