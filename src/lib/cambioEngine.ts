/**
 * Engine de cálculo para ativos de Câmbio (Dólar, Euro).
 *
 * Calcula valuation diário, rentabilidade diária e acumulada com base na
 * cotação PTAX Venda de fechamento.
 */

export interface CambioDailyRow {
  data: string;
  diaUtil: boolean;
  cotacao: number;           // cotação da moeda no dia
  quantidadeMoeda: number;   // quantidade acumulada na moeda estrangeira
  valorBRL: number;          // qty × cotação (valor atualizado)
  aplicacoesBRL: number;     // aplicações no dia em BRL
  resgatesBRL: number;       // resgates no dia em BRL
  ganhoDiarioBRL: number;    // ganho diário em BRL
  rentDiariaPct: number;     // rentabilidade diária %
  rentAcumuladaPct: number;  // rentabilidade acumulada %
  rentAcumuladaBRL: number;  // ganho acumulado em BRL
}

export interface CambioEngineInput {
  dataInicio: string;
  dataCalculo: string;
  cotacaoInicial: number;
  calendario: { data: string; dia_util: boolean }[];
  movimentacoes: { data: string; tipo_movimentacao: string; valor: number; preco_unitario: number | null; quantidade: number | null }[];
  historicoCotacao: { data: string; cotacao_venda: number }[];
  dataResgateTotal?: string | null;
}

export function calcularCambioDiario(input: CambioEngineInput): CambioDailyRow[] {
  const { dataInicio, dataCalculo, calendario, movimentacoes, historicoCotacao, dataResgateTotal } = input;

  // Build maps
  const cotacaoMap = new Map<string, number>();
  for (const r of historicoCotacao) {
    cotacaoMap.set(r.data, r.cotacao_venda);
  }

  const movMap = new Map<string, { aplicacoesBRL: number; resgatesBRL: number; aplicacoesMoeda: number; resgatesMoeda: number }>();
  for (const m of movimentacoes) {
    const existing = movMap.get(m.data) || { aplicacoesBRL: 0, resgatesBRL: 0, aplicacoesMoeda: 0, resgatesMoeda: 0 };
    if (["Aplicação Inicial", "Aplicação"].includes(m.tipo_movimentacao)) {
      existing.aplicacoesBRL += m.valor;
      existing.aplicacoesMoeda += m.quantidade || 0;
    } else if (["Resgate", "Resgate Total"].includes(m.tipo_movimentacao)) {
      existing.resgatesBRL += m.valor;
      existing.resgatesMoeda += m.quantidade || 0;
    }
    movMap.set(m.data, existing);
  }

  // Filter and sort calendar
  const effectiveEnd = dataResgateTotal && dataResgateTotal < dataCalculo ? dataResgateTotal : dataCalculo;
  const calDays = calendario
    .filter(d => d.data >= dataInicio && d.data <= effectiveEnd)
    .sort((a, b) => a.data.localeCompare(b.data));

  if (calDays.length === 0) return [];

  const rows: CambioDailyRow[] = [];
  let qtyMoeda = 0;
  let lastCotacao = input.cotacaoInicial;
  let rentAcumFactor = 1;
  let totalGanho = 0;

  for (const day of calDays) {
    const cotacaoDia = cotacaoMap.get(day.data) ?? lastCotacao;
    const movDia = movMap.get(day.data);
    const aplicacoesBRL = movDia?.aplicacoesBRL || 0;
    const resgatesBRL = movDia?.resgatesBRL || 0;
    const aplicacoesMoeda = movDia?.aplicacoesMoeda || 0;
    const resgatesMoeda = movDia?.resgatesMoeda || 0;

    const prevQtyMoeda = qtyMoeda;
    qtyMoeda += aplicacoesMoeda;
    qtyMoeda -= resgatesMoeda;
    if (qtyMoeda < 0.000001) qtyMoeda = 0;

    const valorBRL = qtyMoeda * cotacaoDia;

    const ganhoDiarioBRL = prevQtyMoeda * (cotacaoDia - lastCotacao);

    const prevValor = prevQtyMoeda * lastCotacao;
    const base = prevValor + aplicacoesBRL;
    const rentDiariaPct = base > 0.01 ? ganhoDiarioBRL / base : 0;

    rentAcumFactor *= (1 + rentDiariaPct);
    totalGanho += ganhoDiarioBRL;

    rows.push({
      data: day.data,
      diaUtil: day.dia_util,
      cotacao: cotacaoDia,
      quantidadeMoeda: qtyMoeda,
      valorBRL,
      aplicacoesBRL,
      resgatesBRL,
      ganhoDiarioBRL,
      rentDiariaPct,
      rentAcumuladaPct: rentAcumFactor - 1,
      rentAcumuladaBRL: totalGanho,
    });

    lastCotacao = cotacaoDia;
  }

  return rows;
}

/**
 * Helper: returns the Supabase table name for a given currency product.
 */
export function getCotacaoTable(produtoNome: string): "historico_dolar" | "historico_euro" {
  if (produtoNome.toLowerCase().includes("euro")) return "historico_euro";
  return "historico_dolar";
}

/**
 * Helper: returns the currency code for display.
 */
export function getCurrencyCode(produtoNome: string): string {
  if (produtoNome.toLowerCase().includes("euro")) return "EUR";
  return "USD";
}
