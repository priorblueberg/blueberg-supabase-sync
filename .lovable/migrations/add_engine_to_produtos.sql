-- Migration to apply via Lovable Cloud → Migrations:
-- Adiciona coluna `engine` à tabela produtos para roteamento explícito de engines.

ALTER TABLE produtos ADD COLUMN IF NOT EXISTS engine text;

UPDATE produtos SET engine = 'CDBLIKE'
WHERE nome IN ('CDB','CDCA','DPGE','LC','LCA','LCI','LCD','LF','LFS','LFSN','LIG','RDB','RDC');

UPDATE produtos SET engine = 'POUPANCA'
WHERE nome ILIKE 'Poupan%';

UPDATE produtos SET engine = 'CAMBIO'
WHERE nome ILIKE ANY (ARRAY['Dólar','Dolar','Euro','USD','EUR']);

COMMENT ON COLUMN produtos.engine IS
  'Identificador da engine de cálculo (CDBLIKE, POUPANCA, CAMBIO). Validado em src/lib/engines/registry.ts.';
