

## Diagnóstico: Por que apenas o Prefixado Mensal aparece nos Proventos

Dois bugs na página `ProventosRecebidosPage.tsx` impedem que títulos Pós Fixado / Mista (CDI) calculem juros periódicos corretamente:

### Bug 1: Campo `indexador` não está no SELECT da query

Linha 62 seleciona:
```
codigo_custodia, nome, data_inicio, data_calculo, taxa, modalidade, 
preco_unitario, resgate_total, pagamento, vencimento, categoria_id, categorias(nome)
```

**Falta `indexador`.** Resultado: `(prod as any).indexador` é sempre `undefined`. O engine trata todos os títulos como se não tivessem indexador, ignorando a lógica CDI. Títulos Pós Fixado 110% CDI e Mista CDI+ 5% não evoluem o PU corretamente, gerando `pagamentoJuros = 0`.

O título Prefixado funciona porque não depende de indexador.

### Bug 2: `historico_cdi` não é buscado

A página busca `historico_selic`, `historico_tr` e `historico_poupanca_rendimento` apenas para Poupança. Mas para títulos CDI/CDI+ de Renda Fixa, o engine precisa de `historico_cdi` (com `cdiRecords`). Sem esses dados, o fator diário CDI é zero e os juros não evoluem.

### Plano de correção

**Arquivo:** `src/pages/ProventosRecebidosPage.tsx`

1. **Adicionar `indexador` ao SELECT** da query de custódia (linha 62).

2. **Buscar `historico_cdi`** no bloco de Promise.all (linhas 99-113): adicionar uma query condicional que busca CDI quando existem títulos RF com indexador CDI na lista `withPayment`.

3. **Passar `cdiRecords` ao engine** na chamada `calcularRendaFixaDiario` (linha 159): incluir o parâmetro `cdiRecords` para títulos com indexador CDI.

Nenhuma outra lógica será alterada. Apenas dados que já existem no banco serão buscados e passados ao engine corretamente.

