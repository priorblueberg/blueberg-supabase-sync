/**
 * Engine registry — fonte única de verdade para identificação do motor
 * de cálculo de cada produto financeiro.
 *
 * A decisão da engine é feita exclusivamente pelo valor da coluna
 * `produtos.engine` (text). Esta lib valida o valor lido do banco e
 * faz o dispatch para a engine correta.
 *
 * Para adicionar uma nova engine:
 *   1. Inclua o id em `ENGINE_IDS`.
 *   2. Atualize a coluna `produtos.engine` no banco para os produtos alvo.
 *   3. Implemente a engine em `src/lib/<nome>Engine.ts`.
 *   4. Adicione o caso de dispatch onde for relevante (páginas/loops).
 */

export const ENGINE_IDS = ["CDBLIKE", "POUPANCA", "CAMBIO"] as const;
export type EngineId = (typeof ENGINE_IDS)[number];

/** Shape mínimo aceito pelo helper — qualquer objeto com `engine` opcional. */
export interface HasEngine {
  engine?: string | null;
  produtos?: { engine?: string | null } | null;
}

/**
 * Lê o id da engine de um produto/custódia.
 * Aceita tanto objetos com `engine` direto (após mapeamento) quanto
 * registros crus do supabase com `produtos.engine` aninhado.
 *
 * Retorna `null` se a engine não estiver configurada ou for desconhecida —
 * o consumidor deve tratar esse caso explicitamente (não há fallback).
 */
export function getEngineId(item: HasEngine | null | undefined): EngineId | null {
  if (!item) return null;
  const raw = (item.engine ?? item.produtos?.engine ?? null) as string | null;
  if (!raw) return null;
  return (ENGINE_IDS as readonly string[]).includes(raw) ? (raw as EngineId) : null;
}

/** Type-guard de igualdade — `isEngine(p, "CDBLIKE")`. */
export function isEngine(item: HasEngine | null | undefined, id: EngineId): boolean {
  return getEngineId(item) === id;
}

/**
 * Avisa no console quando um produto não tem engine configurada.
 * Use nos pontos onde um item é descartado por esse motivo.
 */
export function warnMissingEngine(context: string, item: { codigo_custodia?: number; nome?: string | null; produto_nome?: string | null }) {
  // eslint-disable-next-line no-console
  console.warn(
    `[engine] Produto sem engine configurada — ignorado em ${context}.`,
    { codigo: item.codigo_custodia, nome: item.nome ?? item.produto_nome ?? null },
  );
}
