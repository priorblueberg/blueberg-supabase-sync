-- Garante que `calendario_ipca` (dados públicos de mercado) seja legível
-- por qualquer usuário autenticado. Sintoma: a query do client retornava
-- [] mesmo com a tabela populada — indica RLS bloqueando SELECT.

ALTER TABLE public.calendario_ipca ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendario_ipca_select_authenticated" ON public.calendario_ipca;

CREATE POLICY "calendario_ipca_select_authenticated"
  ON public.calendario_ipca
  FOR SELECT
  TO authenticated
  USING (true);
