/**
 * Plugin de filtragem da lista de Posição Consolidada.
 *
 * Regra global (espelhada das Carteiras): um título só aparece se sua
 * data_inicio for menor ou igual à data de referência selecionada.
 * Títulos liquidados continuam visíveis (data_inicio é sempre passada).
 *
 * Esta função é o "plugin" — qualquer alteração na lista de posição
 * consolidada deve ser feita aqui. As páginas das Carteiras (Renda Fixa,
 * Câmbio, etc.) consomem esta função para garantir consistência.
 */
export function filtrarProdutosPorDataReferencia<
  T extends { data_inicio: string }
>(produtos: T[], dataReferenciaISO: string): T[] {
  return produtos.filter((p) => dataReferenciaISO >= p.data_inicio);
}
