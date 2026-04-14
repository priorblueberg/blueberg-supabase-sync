

## Fix: Cotação com 4 casas decimais — pontos faltantes

### Diagnóstico

A alteração anterior corrigiu o campo de input e o pre-fill, mas **dois pontos** ficaram de fora:

1. **Edição de movimentação existente (linha 657):** Ao carregar uma movimentação para edição, o `preco_unitario` é formatado com `formatCurrency` (2 casas). Para moedas, deve usar `formatCotacao4` (4 casas). Isso faz com que ao editar um câmbio, a cotação apareça truncada.

2. **Exibição na tabela de detalhes (`PosicaoDetalheDialog.tsx`):** A coluna "Preço Unit." usa `fmtBrl` que formata com 2 casas decimais. Para moedas, deve exibir 4 casas.

### Observação sobre o dado existente

O ativo "Dólar Em Espécie" já está salvo com `preco_unitario = 4.97` e `quantidade = 10.026,96`. O saldo de R$ 49.967,36 vem de `10.026,96 × PTAX(4,9833)`. O valor correto de R$ 49.833,00 só aparecerá quando o usuário re-salvar a transação com a cotação correta de 4 casas (ex: 4,9833), que produzirá `quantidade = 49.833 / 4,9833 = 10.000,00`.

### Alterações

**Arquivo 1: `src/pages/CadastrarTransacaoPage.tsx`**

- Linha ~657: Ao carregar movimentação para edição, verificar se é moeda. Se sim, usar `formatCotacao4(Math.round(mov.preco_unitario * 10000).toString())` ao invés de `formatCurrency(Math.round(mov.preco_unitario * 100).toString())`.

**Arquivo 2: `src/components/PosicaoDetalheDialog.tsx`**

- Receber a `categoriaId` (já disponível em `PosicaoDetalheData`).
- Na coluna "Preço Unit.", se a categoria for moedas, formatar com 4 casas decimais ao invés de 2.

### Dados técnicos

- A categoria "Moedas" é identificada por `categoriaId` que já está em `PosicaoDetalheData`.
- Precisamos saber o ID da categoria moedas ou verificar por nome do produto. A forma mais simples: checar se `data.categoriaId` corresponde à categoria moedas, ou verificar se o nome contém "Dólar"/"Euro".
- Para `PosicaoDetalheDialog`, basta criar uma função `fmtPrecoUnit` que usa 4 casas quando é moeda.

