Reenviar a migration `.lovable/migrations/financas_pessoais.sql` num cartão novo no chat para você poder tocar em **"Aplicar"** no celular.

A migration cria as tabelas de Finanças Pessoais no seu Supabase:

- `fp_contas` — contas correntes
- `fp_categorias` — categorias (crédito/débito) com seeds padrão
- `fp_subcategorias` — subcategorias com seeds padrão
- `fp_formas_pagamento` — formas de pagamento (Dinheiro, Pix, Crédito, etc.)
- `fp_lancamentos` — lançamentos financeiros

Inclui também:
- RLS por `auth.uid() = user_id` em todas as tabelas
- Leitura pública dos registros padrão (`user_id IS NULL`) em categorias, subcategorias e formas de pagamento
- Índices em `fp_lancamentos(user_id, data)` e `fp_lancamentos(conta_id)`

Nenhum código da aplicação será alterado — só será reenviado o arquivo SQL existente para gerar um cartão novo de "Aplicar" no chat.

**Próximo passo:** aprove este plano. Em seguida vou reenviar o arquivo, o cartão "Aplicar" aparece no chat e você toca para executar no Supabase.