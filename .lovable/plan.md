
## Investigação

O usuário tem 2 títulos:
- CDB Banco ABC Brasil — venc. 30/03/2026
- CDB Bradesco — venc. 31/03/2026

Na data de referência (provavelmente 31/03/2026 ou posterior), ambos aparecem como "Liquidado" com Valor Atualizado R$ 0,00, mas o usuário relata que o Bradesco (31/03/2026) **não aparece** na lista de extrato da Posição Consolidada.

Pela imagem enviada (que parece ser da Carteira de RF), os 2 estão lá. Então o problema é específico da página **Posição Consolidada**.

Preciso investigar como `PosicaoConsolidadaPage.tsx` filtra/exibe títulos, especialmente os já liquidados (vencidos com saldo zero).
