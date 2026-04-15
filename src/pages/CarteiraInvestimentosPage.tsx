import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataReferencia } from "@/contexts/DataReferenciaContext";
import { calcularRendaFixaDiario, DailyRow } from "@/lib/rendaFixaEngine";
import { fetchIpcaRecordsBatch } from "@/lib/ipcaHelper";
import { calcularCarteiraRendaFixa, CarteiraRFRow } from "@/lib/carteiraRendaFixaEngine";
import { calcularPoupancaDiario, buildPoupancaLotesFromMovs } from "@/lib/poupancaEngine";
import { calcularCambioDiario, getCurrencyCode, type CambioDailyRow } from "@/lib/cambioEngine";
import { ConsolidatedDailyRow } from "@/lib/carteiraInvestimentosEngine";
import { buildCdiSeries, CdiRecord } from "@/lib/cdiCalculations";
import { buildDetailRowsFromEngine } from "@/lib/detailRowsBuilder";
import RentabilidadeDetailTable from "@/components/RentabilidadeDetailTable";
import {
  cacheRFResult, getCachedRFResult, buildMovsHash,
} from "@/lib/engineCache";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import CarteirasSummaryTable, { type CarteiraSummaryRow } from "@/components/CarteirasSummaryTable";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

function getDateMinus(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const PIE_COLORS = [
  "hsl(210, 100%, 45%)",
  "hsl(150, 60%, 40%)",
  "hsl(30, 90%, 50%)",
  "hsl(270, 60%, 50%)",
  "hsl(0, 70%, 50%)",
  "hsl(180, 60%, 40%)",
];

const CustomTooltipChart = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
        <p className="text-foreground font-medium mb-1">{label}</p>
        {payload.map((entry: any) => (
          <p key={entry.dataKey} style={{ color: entry.color }} className="font-semibold">
            {entry.name}: {entry.value?.toFixed(2)}%
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const PieTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    return (
      <div className="rounded-md border border-border bg-card px-3 py-2 text-xs shadow-sm">
        <p className="text-foreground font-medium">{payload[0].name}</p>
        <p className="font-semibold text-foreground">{payload[0].value.toFixed(1)}%</p>
      </div>
    );
  }
  return null;
};

interface UnifiedProduct {
  categoria: string;
  nome: string;
  valorAtualizado: number;
  ganhoFinanceiro: number;
  rentabilidade: number;
  custodiante: string;
  ativo: boolean;
}

// Module-level cache
let _invCachedVersion: number | null = null;
let _invCached: {
  consolidatedRows: ConsolidatedDailyRow[];
  rfCarteiraRows: CarteiraRFRow[];
  cambioCarteiraRows: CarteiraRFRow[];
  cdiRecords: CdiRecord[];
  ibovespaData: { data: string; pontos: number }[];
  unifiedProducts: UnifiedProduct[];
  carteiraSummary: CarteiraSummaryRow[];
  dataInicio: string | null;
  dataCalculo: string | null;
  rfPatrimonio: number;
  cambioPatrimonio: number;
} | null = null;

import { registerCacheReset } from "@/lib/resetCaches";
registerCacheReset(() => { _invCachedVersion = null; _invCached = null; });

export default function CarteiraInvestimentosPage() {
  const { user } = useAuth();
  const { appliedVersion, dataReferenciaISO } = useDataReferencia();
  const [loading, setLoading] = useState(_invCachedVersion === null);
  const [consolidatedRows, setConsolidatedRows] = useState<ConsolidatedDailyRow[]>(_invCached?.consolidatedRows ?? []);
  const [rfCarteiraRows, setRfCarteiraRows] = useState<CarteiraRFRow[]>(_invCached?.rfCarteiraRows ?? []);
  const [cambioCarteiraRows, setCambioCarteiraRows] = useState<CarteiraRFRow[]>(_invCached?.cambioCarteiraRows ?? []);
  const [cdiRecords, setCdiRecords] = useState<CdiRecord[]>(_invCached?.cdiRecords ?? []);
  const [ibovespaData, setIbovespaData] = useState<{ data: string; pontos: number }[]>(_invCached?.ibovespaData ?? []);
  const [unifiedProducts, setUnifiedProducts] = useState<UnifiedProduct[]>(_invCached?.unifiedProducts ?? []);
  const [dataInicio, setDataInicio] = useState<string | null>(_invCached?.dataInicio ?? null);
  const [dataCalculo, setDataCalculo] = useState<string | null>(_invCached?.dataCalculo ?? null);
  const [rfPatrimonio, setRfPatrimonio] = useState(_invCached?.rfPatrimonio ?? 0);
  const [cambioPatrimonio, setCambioPatrimonio] = useState(_invCached?.cambioPatrimonio ?? 0);
  const [carteiraSummary, setCarteiraSummary] = useState<CarteiraSummaryRow[]>(_invCached?.carteiraSummary ?? []);
  const [seriesVisibility, setSeriesVisibility] = useState({ cdi: true, ibovespa: false });
  const calcVersionRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    if (_invCachedVersion === appliedVersion) return;
    calcVersionRef.current += 1;
    const myVersion = calcVersionRef.current;

    (async () => {
      setLoading(true);
      try {
        // 1. Fetch all custodia + carteiras info
        const [{ data: custodiaData }, { data: carteirasData }, { data: catMoedasData }] = await Promise.all([
          supabase
            .from("custodia")
            .select("id, codigo_custodia, nome, data_inicio, data_calculo, data_limite, taxa, modalidade, preco_unitario, resgate_total, pagamento, vencimento, indexador, valor_investido, estrategia, quantidade, categoria_id, produto_id, categorias(nome), produtos(nome), instituicoes(nome), emissores(nome)")
            .eq("user_id", user.id),
          supabase
            .from("controle_de_carteiras")
            .select("nome_carteira, status, data_inicio, data_calculo, data_limite, resgate_total")
            .eq("user_id", user.id),
          supabase.from("categorias").select("id").eq("nome", "Moedas").maybeSingle(),
        ]);

        const allCustodia = custodiaData || [];
        const rfCustodia = allCustodia.filter((r: any) => r.categorias?.nome === "Renda Fixa");
        const cambioCustodia = allCustodia.filter((r: any) => r.categorias?.nome === "Moedas");

        const rfCart = (carteirasData || []).find((c: any) => c.nome_carteira === "Renda Fixa");
        const cambioCart = (carteirasData || []).find((c: any) => c.nome_carteira === "Câmbio");

        // Determine global date range
        const allDates: string[] = [];
        if (rfCart?.data_inicio) allDates.push(rfCart.data_inicio);
        for (const c of cambioCustodia) {
          if (c.data_inicio && dataReferenciaISO >= c.data_inicio) allDates.push(c.data_inicio);
        }

        if (allDates.length === 0) {
          setLoading(false);
          setConsolidatedRows([]);
          setUnifiedProducts([]);
          setDataInicio(null);
          _invCachedVersion = appliedVersion;
          return;
        }

        const globalDataInicio = allDates.sort()[0];
        const globalDataCalculo = dataReferenciaISO;
        setDataInicio(globalDataInicio);
        setDataCalculo(globalDataCalculo);

        // Determine max end date for calendar/cdi fetch
        const allEndDates = [globalDataCalculo];
        for (const p of rfCustodia) {
          const end = p.resgate_total || p.vencimento || globalDataCalculo;
          if (end > globalDataCalculo) allEndDates.push(end);
        }
        const maxEndDate = allEndDates.sort().pop()!;

        // 2. Fetch all historical data
        const poupancaProds = rfCustodia.filter((p: any) => p.modalidade === "Poupança");
        const hasPoupanca = poupancaProds.length > 0;
        const needsDolar = cambioCustodia.some((p: any) => !p.produtos?.nome?.toLowerCase().includes("euro"));
        const needsEuro = cambioCustodia.some((p: any) => p.produtos?.nome?.toLowerCase().includes("euro"));

        const allCodigos = [...rfCustodia, ...cambioCustodia].map((p: any) => p.codigo_custodia);

        const [calRes, cdiRes, ibovRes, selicRes, trRes, poupRendRes, dolarRes, euroRes, movRes] = await Promise.all([
          supabase.from("calendario_dias_uteis").select("data, dia_util")
            .gte("data", getDateMinus(globalDataInicio, 5)).lte("data", maxEndDate).order("data"),
          supabase.from("historico_cdi").select("data, taxa_anual")
            .gte("data", globalDataInicio).lte("data", globalDataCalculo).order("data"),
          supabase.from("historico_ibovespa").select("data, pontos")
            .gte("data", globalDataInicio).lte("data", globalDataCalculo).order("data"),
          hasPoupanca
            ? supabase.from("historico_selic").select("data, taxa_anual").gte("data", getDateMinus(globalDataInicio, 5)).lte("data", maxEndDate).order("data")
            : Promise.resolve({ data: [] }),
          hasPoupanca
            ? supabase.from("historico_tr").select("data, taxa_mensal").gte("data", getDateMinus(globalDataInicio, 5)).lte("data", maxEndDate).order("data")
            : Promise.resolve({ data: [] }),
          hasPoupanca
            ? supabase.from("historico_poupanca_rendimento").select("data, rendimento_mensal").gte("data", getDateMinus(globalDataInicio, 5)).lte("data", maxEndDate).order("data")
            : Promise.resolve({ data: [] }),
          needsDolar
            ? supabase.from("historico_dolar").select("data, cotacao_venda").gte("data", getDateMinus(globalDataInicio, 5)).lte("data", globalDataCalculo).order("data")
            : Promise.resolve({ data: [] }),
          needsEuro
            ? supabase.from("historico_euro").select("data, cotacao_venda").gte("data", getDateMinus(globalDataInicio, 5)).lte("data", globalDataCalculo).order("data")
            : Promise.resolve({ data: [] }),
          allCodigos.length > 0
            ? supabase.from("movimentacoes").select("data, tipo_movimentacao, valor, preco_unitario, quantidade, codigo_custodia").in("codigo_custodia", allCodigos).eq("user_id", user.id).order("data")
            : Promise.resolve({ data: [] }),
        ]);

        if (myVersion !== calcVersionRef.current) { setLoading(false); return; }

        const calendario = (calRes.data || []).map((c: any) => ({ data: c.data, dia_util: c.dia_util }));
        const cdiRaw = (cdiRes.data || []).map((c: any) => ({ data: c.data, taxa_anual: Number(c.taxa_anual) }));
        const ibovRaw = (ibovRes.data || []).map((r: any) => ({ data: r.data, pontos: Number(r.pontos) }));
        setIbovespaData(ibovRaw);

        const calMap = new Map<string, boolean>();
        calendario.forEach(c => calMap.set(c.data, c.dia_util));
        const mergedCdi: CdiRecord[] = cdiRaw.map(r => ({ ...r, dia_util: calMap.get(r.data) ?? false }));
        setCdiRecords(mergedCdi);

        const cdiMap = new Map<string, number>();
        for (const c of cdiRaw) cdiMap.set(c.data, c.taxa_anual);

        const selicRecords = ((selicRes as any).data || []).map((s: any) => ({ data: s.data, taxa_anual: Number(s.taxa_anual) }));
        const trRecords = ((trRes as any).data || []).map((t: any) => ({ data: t.data, taxa_mensal: Number(t.taxa_mensal) }));
        const poupancaRendimentoRecords = ((poupRendRes as any).data || []).map((r: any) => ({ data: r.data, rendimento_mensal: Number(r.rendimento_mensal) }));
        const dolarRecords = ((dolarRes as any).data || []).map((d: any) => ({ data: d.data, cotacao_venda: Number(d.cotacao_venda) }));
        const euroRecords = ((euroRes as any).data || []).map((d: any) => ({ data: d.data, cotacao_venda: Number(d.cotacao_venda) }));

        const movByCodigo = new Map<number, any[]>();
        for (const m of ((movRes as any).data || [])) {
          const code = m.codigo_custodia as number;
          if (!movByCodigo.has(code)) movByCodigo.set(code, []);
          movByCodigo.get(code)!.push({
            data: m.data,
            tipo_movimentacao: m.tipo_movimentacao,
            valor: Number(m.valor),
            preco_unitario: m.preco_unitario != null ? Number(m.preco_unitario) : null,
            quantidade: m.quantidade != null ? Number(m.quantidade) : null,
          });
        }

        // 3. Compute RF product rows
        const ipcaData = await fetchIpcaRecordsBatch(
          rfCustodia.filter((p: any) => p.modalidade !== "Poupança"),
          globalDataCalculo
        );
        if (myVersion !== calcVersionRef.current) { setLoading(false); return; }

        const rfProdRows: DailyRow[][] = [];
        const rfProductMeta: any[] = [];

        for (const product of rfCustodia.filter((p: any) => p.modalidade !== "Poupança")) {
          const dataFim = product.resgate_total || product.vencimento || globalDataCalculo;
          const calcEnd = dataFim > globalDataCalculo ? globalDataCalculo : dataFim;
          const productMovs = movByCodigo.get(product.codigo_custodia) || [];
          const movsHash = buildMovsHash(productMovs);

          const cacheParams = {
            dataInicio: product.data_inicio,
            taxa: product.taxa || 0,
            modalidade: product.modalidade || "",
            puInicial: product.preco_unitario || 1000,
            pagamento: product.pagamento,
            vencimento: product.vencimento,
            indexador: product.indexador,
            dataResgateTotal: product.resgate_total,
            dataLimite: product.data_limite,
            movsHash,
          };

          let engineRows = getCachedRFResult(product.codigo_custodia, calcEnd, cacheParams);

          if (!engineRows) {
            const maxEnd = dataFim > globalDataCalculo ? dataFim : globalDataCalculo;
            const fullRows = calcularRendaFixaDiario({
              dataInicio: product.data_inicio,
              dataCalculo: maxEnd,
              taxa: product.taxa || 0,
              modalidade: product.modalidade || "",
              puInicial: product.preco_unitario || 1000,
              calendario,
              movimentacoes: productMovs,
              dataResgateTotal: product.resgate_total,
              pagamento: product.pagamento,
              vencimento: product.vencimento,
              indexador: product.indexador,
              cdiRecords: cdiRaw,
              dataLimite: product.data_limite,
              precomputedCdiMap: cdiMap,
              calendarioSorted: true,
              ipcaOficialRecords: product.indexador === "IPCA" ? ipcaData?.oficial : undefined,
              ipcaProjecaoRecords: product.indexador === "IPCA" ? ipcaData?.projecao : undefined,
            });
            cacheRFResult(product.codigo_custodia, fullRows, cacheParams);
            engineRows = getCachedRFResult(product.codigo_custodia, calcEnd, cacheParams) || fullRows;
          }

          rfProdRows.push(engineRows);
          rfProductMeta.push(product);
        }

        // Poupança products
        for (const product of poupancaProds) {
          const allMovsForProduct = movByCodigo.get(product.codigo_custodia) || [];
          const lotesForEngine = buildPoupancaLotesFromMovs(allMovsForProduct);
          if (lotesForEngine.length === 0) continue;

          rfProdRows.push(calcularPoupancaDiario({
            dataInicio: lotesForEngine[0].data_aplicacao,
            dataCalculo: globalDataCalculo,
            calendario,
            movimentacoes: allMovsForProduct,
            lotes: lotesForEngine,
            selicRecords,
            trRecords,
            poupancaRendimentoRecords,
            dataResgateTotal: product.resgate_total,
          }));
          rfProductMeta.push(product);
        }

        // RF Carteira TWR
        const rfDataInicio = rfCart?.data_inicio || globalDataInicio;
        const rfResult = rfProdRows.length > 0
          ? calcularCarteiraRendaFixa({ productRows: rfProdRows, calendario, dataInicio: rfDataInicio, dataCalculo: globalDataCalculo })
          : [];
        setRfCarteiraRows(rfResult);

        // 4. Compute Câmbio product rows
        const cambioProdRows: any[][] = [];
        const cambioProductMeta: any[] = [];
        const cambioValidProds = cambioCustodia.filter((p: any) => dataReferenciaISO >= p.data_inicio);

        for (const product of cambioValidProds) {
          const isEuro = product.produtos?.nome?.toLowerCase().includes("euro");
          const cotacaoRecords = isEuro ? euroRecords : dolarRecords;
          const rows = calcularCambioDiario({
            dataInicio: product.data_inicio,
            dataCalculo: globalDataCalculo,
            cotacaoInicial: product.preco_unitario != null ? Number(product.preco_unitario) : 1,
            calendario,
            movimentacoes: movByCodigo.get(product.codigo_custodia) || [],
            historicoCotacao: cotacaoRecords,
            dataResgateTotal: product.resgate_total,
          });

          // Adapt to DailyRow-like format for carteiraRendaFixaEngine
          const adapted = rows.map(r => ({
            data: r.data,
            diaUtil: r.diaUtil,
            liquido: r.valorBRL,
            liquido2: r.valorBRL,
            aplicacoes: r.aplicacoesBRL,
            resgates: r.resgatesBRL,
            saldoCotas: r.quantidadeMoeda,
            ganhoAcumulado: r.rentAcumuladaBRL,
            ganhoDiario: r.ganhoDiarioBRL,
            rentabilidadeDiaria: r.rentDiariaPct,
            jurosPago: 0,
            rentabilidadeAcumuladaPct: r.rentAcumuladaPct,
            rentAcumulada2: r.rentAcumuladaPct,
          }));
          cambioProdRows.push(adapted);
          cambioProductMeta.push({ ...product, _rows: rows });
        }

        const cambioDataInicio = cambioValidProds.length > 0
          ? cambioValidProds.reduce((min: string, p: any) => p.data_inicio < min ? p.data_inicio : min, cambioValidProds[0].data_inicio)
          : globalDataInicio;
        const cambioResult = cambioProdRows.length > 0
          ? calcularCarteiraRendaFixa({ productRows: cambioProdRows as any, calendario, dataInicio: cambioDataInicio, dataCalculo: globalDataCalculo })
          : [];
        setCambioCarteiraRows(cambioResult);

        if (myVersion !== calcVersionRef.current) { setLoading(false); return; }

        // 5. Consolidate — use the same engine as Posição Consolidada
        const allProductRows = [...rfProdRows, ...cambioProdRows];
        const consolidatedRF = allProductRows.length > 0
          ? calcularCarteiraRendaFixa({ productRows: allProductRows as any, calendario, dataInicio: globalDataInicio, dataCalculo: globalDataCalculo })
          : [];
        const consolidated: ConsolidatedDailyRow[] = consolidatedRF.map(r => ({
          data: r.data,
          diaUtil: r.diaUtil,
          patrimonio: r.liquido,
          aplicacoes: 0,
          resgates: 0,
          ganhoDiarioRS: r.rentDiariaRS,
          ganhoAcumuladoRS: r.rentAcumuladaRS,
          rentDiariaPct: r.rentDiariaPct,
          rentAcumuladaPct: r.rentAcumuladaPct,
        }));
        setConsolidatedRows(consolidated);

        // 6. Build unified product list
        const products: UnifiedProduct[] = [];

        // RF products
        for (let i = 0; i < rfProductMeta.length; i++) {
          const product = rfProductMeta[i];
          const rows = rfProdRows[i];
          const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
          const isEncerrado = product.resgate_total
            ? product.resgate_total <= globalDataCalculo
            : product.vencimento
              ? product.vencimento <= globalDataCalculo
              : false;
          const usePeriodic = product.pagamento && product.pagamento !== "No Vencimento";
          const rentPct = lastRow ? ((usePeriodic ? lastRow.rentAcumulada2 : lastRow.rentabilidadeAcumuladaPct) * 100) : 0;

          products.push({
            categoria: "Renda Fixa",
            nome: product.nome || product.produtos?.nome || "",
            valorAtualizado: isEncerrado ? 0 : (lastRow?.liquido ?? 0),
            ganhoFinanceiro: lastRow?.ganhoAcumulado ?? 0,
            rentabilidade: rentPct,
            custodiante: product.instituicoes?.nome || "—",
            ativo: !isEncerrado,
          });
        }

        // Câmbio products
        for (let i = 0; i < cambioProductMeta.length; i++) {
          const product = cambioProductMeta[i];
          const rows: CambioDailyRow[] = product._rows || [];
          const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
          const isEncerrado = product.resgate_total ? product.resgate_total <= globalDataCalculo : false;

          products.push({
            categoria: "Moedas",
            nome: product.nome || product.produtos?.nome || "",
            valorAtualizado: isEncerrado ? 0 : (lastRow?.valorBRL ?? 0),
            ganhoFinanceiro: lastRow?.rentAcumuladaBRL ?? 0,
            rentabilidade: lastRow ? lastRow.rentAcumuladaPct * 100 : 0,
            custodiante: product.instituicoes?.nome || "—",
            ativo: !isEncerrado,
          });
        }
        setUnifiedProducts(products);

        // Patrimônio by category
        const rfPat = rfResult.length > 0 ? rfResult[rfResult.length - 1].liquido : 0;
        const cambioPat = cambioResult.length > 0 ? cambioResult[cambioResult.length - 1].liquido : 0;
        setRfPatrimonio(rfPat);
        setCambioPatrimonio(cambioPat);

        // Build carteiras summary for this page
        const rfRent = rfResult.length > 0 ? rfResult[rfResult.length - 1].rentAcumuladaPct * 100 : 0;
        const rfGanho = rfResult.length > 0 ? rfResult[rfResult.length - 1].rentAcumuladaRS : 0;
        const cambioRent = cambioResult.length > 0 ? cambioResult[cambioResult.length - 1].rentAcumuladaPct * 100 : 0;
        const cambioGanho = cambioResult.length > 0 ? cambioResult[cambioResult.length - 1].rentAcumuladaRS : 0;

        const computeStatus = (cartName: string) => {
          const cart = (carteirasData || []).find((c: any) => c.nome_carteira === cartName);
          if (!cart) return "Ativa";
          if (cart.data_inicio && dataReferenciaISO < cart.data_inicio) return "Não Iniciada";
          if (cart.resgate_total && dataReferenciaISO >= cart.resgate_total) return "Encerrada";
          return "Ativa";
        };

        const cSummary: CarteiraSummaryRow[] = [];
        if (rfResult.length > 0) cSummary.push({ status: computeStatus("Renda Fixa"), carteira: "Renda Fixa", valorAtualizado: rfPat, ganhoFinanceiro: rfGanho, rentabilidade: rfRent });
        if (cambioResult.length > 0) cSummary.push({ status: computeStatus("Câmbio"), carteira: "Moedas", valorAtualizado: cambioPat, ganhoFinanceiro: cambioGanho, rentabilidade: cambioRent });
        setCarteiraSummary(cSummary);

        _invCachedVersion = appliedVersion;
        _invCached = {
          consolidatedRows: consolidated,
          rfCarteiraRows: rfResult,
          cambioCarteiraRows: cambioResult,
          cdiRecords: mergedCdi,
          ibovespaData: ibovRaw,
          unifiedProducts: products,
          carteiraSummary: cSummary,
          dataInicio: globalDataInicio,
          dataCalculo: globalDataCalculo,
          rfPatrimonio: rfPat,
          cambioPatrimonio: cambioPat,
        };
      } catch (err) {
        console.error("Erro ao carregar Carteira de Investimentos:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, appliedVersion]);

  // Chart data
  const chartData = useMemo(() => {
    if (!dataInicio || consolidatedRows.length === 0) return [];

    const enginePoints = consolidatedRows
      .filter(r => r.patrimonio > 0)
      .map(r => ({
        data: r.data,
        label: new Date(r.data + "T00:00:00").toLocaleDateString("pt-BR"),
        titulo_acumulado: parseFloat((r.rentAcumuladaPct * 100).toFixed(4)),
      }));

    const lastDate = enginePoints.length > 0 ? enginePoints[enginePoints.length - 1].data : dataCalculo ?? undefined;
    const cdiSeries = buildCdiSeries(cdiRecords, dataInicio, lastDate);

    const ibovMap = new Map<string, number>();
    if (ibovespaData.length > 0) {
      const base = ibovespaData[0].pontos;
      for (const item of ibovespaData) {
        if (lastDate && item.data > lastDate) continue;
        ibovMap.set(item.data, parseFloat(((item.pontos / base - 1) * 100).toFixed(4)));
      }
    }

    const map = new Map<string, any>();
    for (const p of cdiSeries) map.set(p.data, { data: p.data, label: p.label, cdi_acumulado: p.cdi_acumulado });
    for (const p of enginePoints) {
      const existing = map.get(p.data) || { data: p.data, label: p.label };
      existing.titulo_acumulado = p.titulo_acumulado;
      existing.label = existing.label || p.label;
      map.set(p.data, existing);
    }
    for (const [data, value] of ibovMap) {
      const existing = map.get(data) || { data, label: new Date(data + "T00:00:00").toLocaleDateString("pt-BR") };
      existing.ibovespa_acumulado = value;
      map.set(data, existing);
    }
    return Array.from(map.values()).sort((a: any, b: any) => a.data.localeCompare(b.data));
  }, [consolidatedRows, cdiRecords, ibovespaData, dataInicio, dataCalculo]);

  // Monthly patrimonio data for bar chart
  const monthlyBarData = useMemo(() => {
    if (consolidatedRows.length === 0) return [];
    const MONTH_LABELS = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
    const monthMap = new Map<string, number>();

    // Compute 12-month cutoff
    const refDate = new Date(dataReferenciaISO + "T00:00:00");
    refDate.setMonth(refDate.getMonth() - 11);
    const cutoffKey = `${refDate.getFullYear()}-${String(refDate.getMonth()).padStart(2, "0")}`;

    for (const row of consolidatedRows) {
      if (row.patrimonio <= 0) continue;
      const dt = new Date(row.data + "T00:00:00");
      const key = `${dt.getFullYear()}-${String(dt.getMonth()).padStart(2, "0")}`;
      if (key < cutoffKey) continue;
      monthMap.set(key, row.patrimonio);
    }

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, patrimonio]) => {
        const [y, m] = key.split("-");
        return { mes: `${MONTH_LABELS[parseInt(m)]}/${y.slice(2)}`, patrimonio };
      });
  }, [consolidatedRows, dataReferenciaISO]);

  // Detail rows for RentabilidadeDetailTable
  const detailRows = useMemo(() => {
    if (consolidatedRows.length === 0 || !dataInicio) return [];
    const adaptedRows = consolidatedRows.map(r => ({
      data: r.data,
      diaUtil: r.diaUtil,
      liquido: r.patrimonio,
      aplicacoes: r.aplicacoes,
      resgates: r.resgates,
      jurosPago: 0,
      saldoCotas: 1,
      ganhoAcumulado: r.ganhoAcumuladoRS,
      ganhoDiario: r.ganhoDiarioRS,
      rentabilidadeDiaria: r.rentDiariaPct,
    }));
    return buildDetailRowsFromEngine(adaptedRows, cdiRecords, dataInicio);
  }, [consolidatedRows, cdiRecords, dataInicio]);

  // Allocation data
  const allocationData = useMemo(() => {
    const total = rfPatrimonio + cambioPatrimonio;
    if (total <= 0) return [];
    const result: { name: string; value: number }[] = [];
    if (rfPatrimonio > 0) result.push({ name: "Renda Fixa", value: parseFloat(((rfPatrimonio / total) * 100).toFixed(1)) });
    if (cambioPatrimonio > 0) result.push({ name: "Moedas", value: parseFloat(((cambioPatrimonio / total) * 100).toFixed(1)) });
    return result;
  }, [rfPatrimonio, cambioPatrimonio]);

  // Summary values
  const summary = useMemo(() => {
    if (consolidatedRows.length === 0) return null;
    let last: ConsolidatedDailyRow | null = null;
    for (let i = consolidatedRows.length - 1; i >= 0; i--) {
      if (consolidatedRows[i].data <= dataReferenciaISO) {
        last = consolidatedRows[i];
        break;
      }
    }
    if (!last) return null;

    // CDI acumulado
    const cdiSeries = buildCdiSeries(cdiRecords, dataInicio!, dataCalculo ?? undefined);
    const cdiAcum = cdiSeries.length > 0 ? cdiSeries[cdiSeries.length - 1].cdi_acumulado : null;

    return {
      patrimonio: last.patrimonio,
      ganho: last.ganhoAcumuladoRS,
      rentabilidade: last.rentAcumuladaPct * 100,
      cdiAcumulado: cdiAcum,
    };
  }, [consolidatedRows, cdiRecords, dataInicio, dataCalculo, dataReferenciaISO]);

  const fmtBrl = (v: number | null) =>
    v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
  const fmtDate = (d: string | null) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";
  const fmtPct = (v: number | null) =>
    v != null ? `${v.toFixed(2)}%` : "—";

  const hasData = consolidatedRows.length > 0 && summary;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Carteira de Investimentos</h1>
        {dataInicio && dataCalculo && (
          <p className="text-sm text-muted-foreground mt-1">
            Período de Análise: De {fmtDate(dataInicio)} a {fmtDate(dataCalculo)}
          </p>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      ) : !hasData ? (
        <div className="rounded-md border border-border p-8 text-center text-muted-foreground">
          Nenhum dado disponível para o período selecionado.
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Patrimônio", value: fmtBrl(summary.patrimonio) },
              { label: "Ganho Financeiro", value: fmtBrl(summary.ganho) },
              { label: "Rentabilidade", value: fmtPct(summary.rentabilidade) },
              { label: "CDI Acumulado", value: fmtPct(summary.cdiAcumulado) },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
                <p className="text-lg font-semibold text-foreground">{c.value}</p>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Rentabilidade */}
            <div className="rounded-md border border-border bg-card p-6">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Histórico de Rentabilidade</h2>
                  <p className="mt-1 text-xs text-muted-foreground">Variação acumulada (%) no período</p>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch
                      checked={seriesVisibility.cdi}
                      onCheckedChange={(v) => setSeriesVisibility(prev => ({ ...prev, cdi: v }))}
                      className="h-4 w-8 [&>span]:h-3 [&>span]:w-3 data-[state=checked]:[&>span]:translate-x-4"
                    />
                    CDI
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch
                      checked={seriesVisibility.ibovespa}
                      onCheckedChange={(v) => setSeriesVisibility(prev => ({ ...prev, ibovespa: v }))}
                      className="h-4 w-8 [&>span]:h-3 [&>span]:w-3 data-[state=checked]:[&>span]:translate-x-4"
                    />
                    Ibovespa
                  </label>
                </div>
              </div>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} tickFormatter={(v) => `${v}%`} />
                    <Tooltip content={<CustomTooltipChart />} />
                    <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="titulo_acumulado" name="Carteira" stroke="hsl(210, 100%, 45%)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls />
                    {seriesVisibility.cdi && (
                      <Line type="monotone" dataKey="cdi_acumulado" name="CDI" stroke="hsl(0, 0%, 55%)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} strokeDasharray="5 3" connectNulls />
                    )}
                    {seriesVisibility.ibovespa && (
                      <Line type="monotone" dataKey="ibovespa_acumulado" name="Ibovespa" stroke="hsl(30, 90%, 50%)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} strokeDasharray="3 2" connectNulls />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Patrimônio Mensal */}
            <div className="rounded-md border border-border bg-card p-6">
              <h2 className="text-sm font-semibold text-foreground">Patrimônio - Últimos 12 meses</h2>
              <p className="mt-1 text-xs text-muted-foreground">Evolução do patrimônio mensal (R$)</p>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyBarData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} tickFormatter={(v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} />
                    <Tooltip formatter={(value: number) => [value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), "Patrimônio"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }} />
                    <Bar dataKey="patrimonio" name="Patrimônio" fill="hsl(210, 100%, 45%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Alocação por Categoria */}
          {allocationData.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-md border border-border bg-card p-4">
                <h3 className="text-xs font-semibold text-foreground mb-2">Alocação por Categoria</h3>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={allocationData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={70}
                        innerRadius={30}
                        paddingAngle={2}
                        label={({ name, value }) => `${name}: ${value}%`}
                        labelLine={{ strokeWidth: 0.5 }}
                        style={{ fontSize: 9 }}
                      >
                        {allocationData.map((_, idx) => (
                          <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Patrimônio by category */}
              <div className="rounded-md border border-border bg-card p-4">
                <h3 className="text-xs font-semibold text-foreground mb-2">Patrimônio por Categoria</h3>
                <div className="space-y-3 mt-4">
                  {allocationData.map((item, idx) => {
                    const value = item.name === "Renda Fixa" ? rfPatrimonio : cambioPatrimonio;
                    return (
                      <div key={item.name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }} />
                          <span className="text-sm text-foreground">{item.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-semibold text-foreground">{fmtBrl(value)}</span>
                          <span className="text-xs text-muted-foreground ml-2">({item.value}%)</span>
                        </div>
                      </div>
                    );
                  })}
                  <div className="border-t border-border pt-2 flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">Total</span>
                    <span className="text-sm font-bold text-foreground">{fmtBrl(rfPatrimonio + cambioPatrimonio)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tabela de Rentabilidade */}
          {detailRows.length > 0 && (
            <RentabilidadeDetailTable rows={detailRows} tituloLabel="Rentabilidade" />
          )}

          {/* Posição por Carteiras (sem Investimentos) */}
          {carteiraSummary.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Posição por Carteiras</h2>
              <CarteirasSummaryTable rows={carteiraSummary} hideCarteiras={["Investimentos"]} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
