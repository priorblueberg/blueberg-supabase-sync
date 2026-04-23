Disparar a migration `.lovable/migrations/financas_pessoais.sql` (já existente no projeto) para que o cartão de **Apply** apareça no chat e seja executada no Supabase do Blueberg.

A migration cria:
- `fp_contas`, `fp_categorias`, `fp_subcategorias`, `fp_formas_pagamento`, `fp_lancamentos`
- RLS por `auth.uid() = user_id` (com leitura pública de registros padrão `user_id IS NULL` em categorias/subcategorias/formas de pagamento)
- Seeds padrão (categorias, subcategorias, formas de pagamento)
- Índices em `fp_lancamentos(user_id, data)` e `fp_lancamentos(conta_id)`

Nenhum código de aplicação será alterado — páginas, rotas e item de menu de Finanças Pessoais já estão prontos no projeto.