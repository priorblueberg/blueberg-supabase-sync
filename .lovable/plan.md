

## Configurar agendamento automático do daily-market-sync

### Problema
A edge function `daily-market-sync` não possui nenhum agendamento. Não há pg_cron nem serviço externo configurado para chamá-la na madrugada.

### Solução: pg_cron via migration

Criar uma migration SQL que:
1. Habilita a extensão `pg_cron` e `pg_net` (para HTTP calls)
2. Cria um cron job que executa diariamente às 05:00 UTC (02:00 BRT), fazendo um POST HTTP para a edge function

### Arquivo

**Nova migration:** `supabase/migrations/XXXXXX_schedule_daily_market_sync.sql`

```sql
-- Enable required extensions
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Schedule daily-market-sync at 05:00 UTC (02:00 BRT)
select cron.schedule(
  'daily-market-sync',
  '0 5 * * *',
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/daily-market-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

### Observação
- O `pg_cron` e `pg_net` precisam estar habilitados no dashboard do Supabase (Database > Extensions). Se já estiverem, a migration funciona diretamente.
- Os settings `app.settings.supabase_url` e `app.settings.service_role_key` são variáveis padrão do Supabase; caso não estejam disponíveis via `current_setting`, a alternativa é usar as URLs e chaves hardcoded na migration ou utilizar `vault.secrets`.

