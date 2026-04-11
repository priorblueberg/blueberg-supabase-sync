/**
 * Poupança Engine
 * 
 * Calcula a evolução diária de lotes de poupança, com rendimento
 * creditado apenas no aniversário mensal de cada lote.
 * 
 * Regras:
 * - Selic > 8.5% a.a. → 0.5% ao mês + TR
 * - Selic ≤ 8.5% a.a. → 70% da Selic ao mês + TR
 * - O cálculo econômico do rendimento ocorre na data teórica do aniversário
 * - Aplicações nos dias 29, 30 e 31 passam a ter aniversário nominal no dia 1
 * - Resgate segue FIFO (First In, First Out)
 */

import type { DailyRow } from "./rendaFixaEngine";

export interface PoupancaLote {
  id: string;
  data_aplicacao: string;
  dia_aniversario: number;
  valor_principal: number;
  valor_atual: number;
  rendimento_acumulado: number;
  ultimo_aniversario: string | null;
  status: string;
  data_resgate: string | null;
}

export interface PoupancaEngineInput {
  dataInicio: string;
  dataCalculo: string;
  calendario: { data: string; dia_util: boolean }[];
  movimentacoes: { data: string; tipo_movimentacao: string; valor: number }[];
  lotes: PoupancaLote[];
  selicRecords: { data: string; taxa_anual: number }[];
  trRecords?: { data: string; taxa_mensal: number }[];
  poupancaRendimentoRecords?: { data: string; rendimento_mensal: number }[];
  dataResgateTotal?: string | null;
}

interface LoteState {
  id: string;
  dataAplicacao: string;
  diaAniversario: number;
  offsetPrimeiroCiclo: boolean;
  valorPrincipal: number;
  valorAtual: number;
  rendimentoAcumulado: number;
  ultimoAniversario: string | null;
  status: string;
}

/**
 * Calcula o rendimento mensal da poupança com base na Selic vigente.
 * Fórmula oficial: (1 + remunBase) × (1 + TR) - 1
 * remunBase = 0.5% se Selic > 8.5%, senão 70% da Selic mensal.
 */
function calcRendimentoMensal(valorAtual: number, selicAnual: number, trMensal: number): number {
  const tr = trMensal / 100; // Convert from % to decimal
  let remunBase: number;
  if (selicAnual > 8.5) {
    remunBase = 0.005; // 0.5% ao mês
  } else {
    // 70% da Selic mensal
    const fatorMensal = Math.pow(1 + selicAnual / 100, 1 / 12);
    remunBase = (fatorMensal - 1) * 0.70;
  }
  // Composição: (1 + remunBase) × (1 + TR) - 1
  return valorAtual * ((1 + remunBase) * (1 + tr) - 1);
}

/**
 * Calcula o dia de aniversário correto da poupança a partir da data de aplicação.
 * Regra BCB:
 * - Aplicações nos dias 1 a 28: aniversário no mesmo dia de cada mês.
 * - Aplicações nos dias 29, 30 ou 31: aniversário no dia 1 do mês seguinte.
 *
 * Essa função é a fonte única da regra e deve ser usada em todo o fluxo.
 */
export function getDiaAniversarioPoupanca(dataAplicacao: string): number {
  const dia = new Date(dataAplicacao + "T00:00:00").getDate();
  // Dias 29, 30, 31 → aniversário tratado como dia 1 (do mês seguinte)
  return dia >= 29 ? 1 : dia;
}

/**
 * Retorna a data teórica do aniversário em um dado mês/ano,
 * ajustando para o último dia do mês quando necessário (ex: fevereiro).
 */
function getDataTeóricaAniversario(year: number, month: number, diaAniversario: number): string {
  const lastDay = new Date(year, month, 0).getDate(); // último dia do mês (month is 1-indexed here)
  const dia = Math.min(diaAniversario, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * Retorna taxas de fallback apenas quando houver Selic e TR exatamente na data
 * teórica do aniversário. Não carrega valores anteriores automaticamente para
 * evitar inflar o rendimento em meses com lacunas na base.
 */
function getFallbackRatesOnDate(
  date: string,
  selicMap: Map<string, number>,
  trMap: Map<string, number>
): { selicAnual: number; trMensal: number } | null {
  const selicAnual = selicMap.get(date);
  const trMensal = trMap.get(date);

  if (selicAnual === undefined || trMensal === undefined) {
    return null;
  }

  return { selicAnual, trMensal };
}

/**
 * Calcula a evolução diária da poupança, retornando DailyRow[] compatível
 * com o engine de renda fixa para integração com a carteira.
 */
/**
 * Dado uma data de resgate e o dia dominante, retorna a data do último
 * aniversário dominante que já ocorreu (no mês corrente ou anterior).
 */
function findLastDominantAniversario(resgateDate: string, dominantDia: number): string {
  const d = new Date(resgateDate + "T00:00:00");
  const y = d.getFullYear();
  const m = d.getMonth() + 1; // 1-based
  const teorica = getDataTeóricaAniversario(y, m, dominantDia);
  if (teorica <= resgateDate) return teorica;
  // Go to previous month
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  return getDataTeóricaAniversario(py, pm, dominantDia);
}

export function calcularPoupancaDiario(input: PoupancaEngineInput): DailyRow[] {
  const { dataInicio, dataCalculo, calendario, movimentacoes, lotes, selicRecords, trRecords, poupancaRendimentoRecords, dataResgateTotal } = input;

  // Build poupança rendimento map (série 195 BCB — preferred source)
  const poupRendMap = new Map<string, number>();
  if (poupancaRendimentoRecords) {
    for (const r of poupancaRendimentoRecords) {
      poupRendMap.set(r.data, r.rendimento_mensal);
    }
  }

  // Build Selic map (fallback when série 195 not available)
  const selicMap = new Map<string, number>();
  for (const r of selicRecords) {
    selicMap.set(r.data, r.taxa_anual);
  }

  // Build TR map (fallback when série 195 not available)
  const trMap = new Map<string, number>();
  if (trRecords) {
    for (const r of trRecords) {
      trMap.set(r.data, r.taxa_mensal);
    }
  }

  // Build movimentações map
  const movMap = new Map<string, { aplicacoes: number; resgates: number }>();
  for (const m of movimentacoes) {
    const entry = movMap.get(m.data) || { aplicacoes: 0, resgates: 0 };
    if (m.tipo_movimentacao === "Aplicação" || m.tipo_movimentacao === "Aplicação Inicial") {
      entry.aplicacoes += m.valor;
    } else if (m.tipo_movimentacao === "Resgate" || m.tipo_movimentacao === "Resgate Total") {
      entry.resgates += m.valor;
    }
    movMap.set(m.data, entry);
  }

  // Sort and filter calendar
  const sortedCal = calendario
    .filter(c => c.data >= dataInicio && c.data <= dataCalculo)
    .sort((a, b) => a.data.localeCompare(b.data));

  if (sortedCal.length === 0) return [];

  // Initialize lote states (only active lotes)
  const loteStates: LoteState[] = lotes
    .filter(l => l.status === "ativo" || l.data_resgate !== null)
    .map(l => {
      const diaOriginal = new Date(l.data_aplicacao + "T00:00:00").getDate();
      return {
        id: l.id,
        dataAplicacao: l.data_aplicacao,
        diaAniversario: Number(l.dia_aniversario),
        offsetPrimeiroCiclo: diaOriginal >= 29,
        valorPrincipal: Number(l.valor_principal),
        valorAtual: Number(l.valor_principal),
        rendimentoAcumulado: 0,
        ultimoAniversario: null,
        status: "ativo",
      };
    });

  // Aniversário dominante: o dia da primeira aplicação da posição.
  // Nunca muda, independentemente de resgates ou novas aplicações.
  const sortedByDate = [...loteStates].sort((a, b) => a.dataAplicacao.localeCompare(b.dataAplicacao));
  const dominantDia = sortedByDate.length > 0 ? sortedByDate[0].diaAniversario : 1;
  const dominantOffset = sortedByDate.length > 0 ? sortedByDate[0].offsetPrimeiroCiclo : false;
  const dominantDataAplicacao = sortedByDate.length > 0 ? sortedByDate[0].dataAplicacao : dataInicio;

  // NÃO sobrescrevemos os aniversários aqui — cada lote mantém seu dia original
  // até que um resgate dispare a consolidação (efeito prospectivo).

  const rows: DailyRow[] = [];
  let rentAcum2 = 0;
  let ganhoAcumulado = 0;
  let totalAplicacoes = 0;
  let totalResgates = 0;

  // Pre-sort lotes by application date for efficient filtering
  const sortedLoteStates = [...loteStates].sort((a, b) => a.dataAplicacao.localeCompare(b.dataAplicacao));

  for (let idx = 0; idx < sortedCal.length; idx++) {
    const cal = sortedCal[idx];
    const date = cal.data;
    const diaUtil = cal.dia_util;

    // Calculate rendimento for lotes that have their effective anniversary today
    let rendimentoDia = 0;
    // Active lotes: those applied on or before this date and still active
    const activeLotes: LoteState[] = [];
    for (const l of sortedLoteStates) {
      if (l.dataAplicacao > date) break;
      if (l.status === "ativo") activeLotes.push(l);
    }

    for (const lote of activeLotes) {
      if (date <= lote.dataAplicacao) continue;

      const currentDate = new Date(date + "T00:00:00");
      const dataTeoricaAniversario = getDataTeóricaAniversario(
        currentDate.getFullYear(),
        currentDate.getMonth() + 1,
        lote.diaAniversario
      );

      if (dataTeoricaAniversario !== date) continue;

      // Para aplicações nos dias 29-31, o primeiro aniversário válido é dia 1
      // do segundo mês seguinte (ciclo completo). Ex: 29/01 → primeiro em 01/03.
      if (lote.offsetPrimeiroCiclo && lote.ultimoAniversario === null) {
        const appDate = new Date(lote.dataAplicacao + "T00:00:00");
        const appMonth = appDate.getFullYear() * 12 + appDate.getMonth();
        const curDate = new Date(date + "T00:00:00");
        const curMonth = curDate.getFullYear() * 12 + curDate.getMonth();
        if (curMonth < appMonth + 2) continue;
      }

      // Início do ciclo = último aniversário (ou data aplicação se primeiro ciclo)
      // Para lotes com offset (dias 29-31), o primeiro ciclo efetivo
      // inicia no dia 1 do mês seguinte à aplicação.
      let dataInicioCiclo = lote.ultimoAniversario ?? lote.dataAplicacao;
      if (lote.offsetPrimeiroCiclo && lote.ultimoAniversario === null) {
        const appDate = new Date(lote.dataAplicacao + "T00:00:00");
        const nxt = new Date(appDate.getFullYear(), appDate.getMonth() + 1, 1);
        dataInicioCiclo = `${nxt.getFullYear()}-${String(nxt.getMonth() + 1).padStart(2, "0")}-01`;
      }
      const serie195 = poupRendMap.get(dataInicioCiclo);

      let rendBruto: number | null = null;
      if (serie195 !== undefined) {
        rendBruto = lote.valorAtual * (serie195 / 100);
      } else {
        const fallbackRates = getFallbackRatesOnDate(dataInicioCiclo, selicMap, trMap);
        if (fallbackRates) {
          rendBruto = calcRendimentoMensal(
            lote.valorAtual,
            fallbackRates.selicAnual,
            fallbackRates.trMensal
          );
        }
      }

      if (rendBruto === null) continue;

      // Manter 8 casas decimais no intermediário (padrão B3/CETIP)
      const rend = Math.round(rendBruto * 1e8) / 1e8;
      lote.valorAtual += rend;
      lote.rendimentoAcumulado += rend;
      lote.ultimoAniversario = dataTeoricaAniversario;
      rendimentoDia += rend;
    }

    // Process movimentações
    const mov = movMap.get(date) || { aplicacoes: 0, resgates: 0 };

    // Process resgates: reduce lote values proportionally (FIFO within the single lote)
    if (mov.resgates > 0) {
      let restante = mov.resgates;
      // Sort active lotes by application date (FIFO)
      const sortedActive = [...activeLotes].sort((a, b) => a.dataAplicacao.localeCompare(b.dataAplicacao));
      for (const lote of sortedActive) {
        if (restante <= 0.01) break;
        if (lote.valorAtual <= 0.01) continue;

        if (restante >= lote.valorAtual - 0.01) {
          restante -= lote.valorAtual;
          lote.valorAtual = 0;
          lote.valorPrincipal = 0;
          lote.rendimentoAcumulado = 0;
          lote.status = "resgatado";
        } else {
          const proporcao = restante / lote.valorAtual;
          lote.valorPrincipal -= lote.valorPrincipal * proporcao;
          lote.rendimentoAcumulado -= lote.rendimentoAcumulado * proporcao;
          lote.valorAtual -= restante;
          restante = 0;
        }
      }

      // Consolidação pós-resgate: fundir lotes ativos remanescentes em um único
      // usando sempre o aniversário dominante da posição
      const remaining = sortedLoteStates.filter(l => l.status === "ativo" && l.valorAtual > 0.01);
      if (remaining.length > 1) {
        // O primeiro lote (por data) herda tudo
        const target = remaining.sort((a, b) => a.dataAplicacao.localeCompare(b.dataAplicacao))[0];
        let sumValor = 0;
        let sumPrincipal = 0;
        for (const l of remaining) {
          sumValor += l.valorAtual;
          sumPrincipal += l.valorPrincipal;
          if (l !== target) {
            l.valorAtual = 0;
            l.valorPrincipal = 0;
            l.rendimentoAcumulado = 0;
            l.status = "consolidado";
          }
        }
        target.valorAtual = sumValor;
        target.valorPrincipal = sumPrincipal;
        target.rendimentoAcumulado = sumValor - sumPrincipal;
        // Garantir aniversário dominante e recalcular ultimoAniversario
        target.diaAniversario = dominantDia;
        target.offsetPrimeiroCiclo = dominantOffset;
        // Resetar ultimoAniversario para o último aniversário dominante já ocorrido
        target.ultimoAniversario = findLastDominantAniversario(date, dominantDia);
      } else if (remaining.length === 1) {
        // Mesmo com um único lote remanescente, forçar aniversário dominante
        remaining[0].diaAniversario = dominantDia;
        remaining[0].offsetPrimeiroCiclo = dominantOffset;
        remaining[0].ultimoAniversario = findLastDominantAniversario(date, dominantDia);
      }
    }

    // Calculate totals
    const liquido = activeLotes.reduce((sum, l) => sum + l.valorAtual, 0);
    const valorInvestido = activeLotes.reduce((sum, l) => sum + l.valorPrincipal, 0);

    // Ganho diário
    const ganhoDiario = rendimentoDia;
    ganhoAcumulado += ganhoDiario;
    totalAplicacoes += mov.aplicacoes;
    totalResgates += mov.resgates;

    // Rentabilidade acumulada % — Poupança usa retorno simples sobre aporte líquido
    const aporteLiquido = totalAplicacoes - totalResgates;
    rentAcum2 = aporteLiquido > 0.01 ? ganhoAcumulado / aporteLiquido : 0;

    // Rentabilidade diária % (derivada da variação do acumulado)
    const prevRentAcum = idx > 0 ? rows[idx - 1].rentAcumulada2 : 0;
    const rentDiariaPct = (1 + prevRentAcum) > 0.0000001
      ? (1 + rentAcum2) / (1 + prevRentAcum) - 1
      : 0;

    const row: DailyRow = {
      data: date,
      diaUtil,
      valorCota: 1,
      saldoCotas: liquido,
      liquido,
      valorCota2: 1,
      saldoCotas2: liquido + mov.resgates,
      liquido2: liquido + mov.resgates,
      aplicacoes: mov.aplicacoes,
      qtdCotasCompra: 0,
      resgates: mov.resgates,
      qtdCotasResgate: 0,
      ganhoDiario,
      ganhoAcumulado,
      rentabilidadeAcumuladaPct: rentAcum2,
      cdiDiario: 0,
      multiplicador: 0,
      pagamentoJuros: 0,
      apoioCupom: 0,
      cupomAcumulado: 0,
      jurosPago: 0,
      valorInvestido,
      resgateLimpo: mov.resgates,
      precoUnitario: 0,
      qtdAplicacaoPU: 0,
      qtdResgatePU: 0,
      puJurosPeriodicos: 0,
      qtdAplicacao2: 0,
      qtdResgate2: 0,
      baseEconomica: valorInvestido,
      aplicacaoExCupom: mov.aplicacoes,
      resgateExCupom: mov.resgates,
      rentabilidadeDiaria: rentDiariaPct > 0 ? rentDiariaPct : null,
      rentDiariaPct,
      rentAcumulada2: rentAcum2,
    };

    rows.push(row);

    // Check resgate total
    if (dataResgateTotal && date === dataResgateTotal) break;
  }

  return rows;
}

/**
 * Constrói lotes de poupança a partir das movimentações (somente aplicações).
 * Use esta função em vez de buscar lotes do banco de dados para evitar
 * contagem dupla de resgates (o engine aplica resgates via FIFO).
 */
export function buildPoupancaLotesFromMovs(
  movimentacoes: { data: string; tipo_movimentacao: string; valor: number }[]
): PoupancaLote[] {
  return movimentacoes
    .filter(m => m.tipo_movimentacao === "Aplicação Inicial" || m.tipo_movimentacao === "Aplicação")
    .map((m, idx) => ({
      id: `derived-${idx}`,
      data_aplicacao: m.data,
      dia_aniversario: getDiaAniversarioPoupanca(m.data),
      valor_principal: m.valor,
      valor_atual: m.valor,
      rendimento_acumulado: 0,
      ultimo_aniversario: null,
      status: "ativo",
      data_resgate: null,
    }));
}

/**
 * Algoritmo FIFO para resgate de poupança.
 * Consome lotes do mais antigo para o mais novo.
 * Retorna os lotes atualizados e o valor efetivamente resgatado.
 */
export function resgatarPoupancaFIFO(
  lotes: LoteState[],
  valorResgate: number,
  dataResgate: string
): { lotesAtualizados: LoteState[]; valorResgatado: number } {
  const sorted = [...lotes]
    .filter(l => l.status === "ativo")
    .sort((a, b) => a.dataAplicacao.localeCompare(b.dataAplicacao));

  let restante = valorResgate;
  let valorResgatado = 0;

  for (const lote of sorted) {
    if (restante <= 0) break;

    const disponivel = lote.valorAtual;

    if (restante >= disponivel - 0.01) {
      // Consume entire lote
      valorResgatado += disponivel;
      restante -= disponivel;
      lote.status = "resgatado";
      lote.valorAtual = 0;
      lote.valorPrincipal = 0;
    } else {
      // Partial consumption
      const proporcao = restante / lote.valorAtual;
      lote.valorPrincipal -= lote.valorPrincipal * proporcao;
      lote.rendimentoAcumulado -= lote.rendimentoAcumulado * proporcao;
      lote.valorAtual -= restante;
      valorResgatado += restante;
      restante = 0;
    }
  }

  return { lotesAtualizados: sorted, valorResgatado };
}
