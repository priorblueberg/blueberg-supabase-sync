-- Add dia_util column to historico_cdi (true = business day)
ALTER TABLE public.historico_cdi 
  ADD COLUMN IF NOT EXISTS dia_util boolean NOT NULL DEFAULT true;
