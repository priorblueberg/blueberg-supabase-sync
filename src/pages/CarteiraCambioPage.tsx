import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataReferencia } from "@/contexts/DataReferenciaContext";
import { calcularCambioDiario, getCotacaoTable, getCurrencyCode, type CambioDailyRow } from "@/lib/cambioEngine";
import { calcularCarteiraRendaFixa, CarteiraRFRow } from "@/lib/carteiraRendaFixaEngine";
import { buildCdiSeries, CdiRecord } from "@/lib/cdiCalculations";
import { buildDetailRowsFromEngine } from "@/lib/detailRowsBuilder";
import RentabilidadeDetailTable from "@/components/RentabilidadeDetailTable";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft } from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

function getDateMinus(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

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

interface CarteiraInfo {
  nome_carteira: string;
  status: string;
  data_inicio: string | null;
  data_calculo: string | null;
  data_limite: string | null;
  resgate_total: string | null;
}

interface CustodiaProduct {
  id: string;
  codigo_custodia: number;
  nome: string | null;
  data_inicio: string;
  data_calculo: string | null;
  preco_unitario: number | null;
  resgate_total: string | null;
  valor_investido: number;
  quantidade: number | null;
  instituicao_nome: string;
  categoria_id: string;
  produto_id: string;
  produto_nome: string;
  vencimento: string | null;
}

interface ProductAnalysis {
  product: CustodiaProduct;
  rows: CambioDailyRow[];
}

// Module-level cache
let _cambioCachedVersion: number | null = null;
let _cambioCached: {
  carteiraInfo: CarteiraInfo | null;
  carteiraRows: CarteiraRFRow[];
  productAnalyses: ProductAnalysis[];
  cdiRecords: CdiRecord[];
  productList: any[];
} | null = null;

export default function CarteiraCambioPage() {
  const { user } = useAuth();
  const { appliedVersion, dataReferenciaISO } = useDataReferencia();
  const [loading, setLoading] = useState(_cambioCachedVersion === null);
  const [carteiraInfo, setCarteiraInfo] = useState<CarteiraInfo | null>(_cambioCached?.carteiraInfo ?? null);
  const [carteiraRows, setCarteiraRows] = useState<CarteiraRFRow[]>(_cambioCached?.carteiraRows ?? []);
  const [productAnalyses, setProductAnalyses] = useState<ProductAnalysis[]>(_cambioCached?.productAnalyses ?? []);
  const [cdiRecords, setCdiRecords] = useState<CdiRecord[]>(_cambioCached?.cdiRecords ?? []);
  const [productList, setProductList] = useState<any[]>(_cambioCached?.productList ?? []);
  const [selectedProduct, setSelectedProduct] = useState<CustodiaProduct | null>(null);
  const [seriesVisibility, setSeriesVisibility] = useState({ cdi: true });
  const calcVersionRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    if (_cambioCachedVersion === appliedVersion) return;
    calcVersionRef.current += 1;
    const myVersion = calcVersionRef.current;

    (async () => {
      setLoading(true);
      try {
        const [{ data: cartData }, { data: catData }] = await Promise.all([
          supabase
            .from("controle_de_carteiras")
            .select("nome_carteira, status, data_inicio, data_calculo, data_limite, resgate_total")
            .eq("nome_carteira", "Câmbio")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase.from("categorias").select("id").eq("nome", "Moedas").single(),
        ]);

        if (!catData) {
          setCarteiraInfo(null);
          setProductAnalyses([]);
          setProductList([]);
          setLoading(false);
          return;
        }

        const { data: custodiaData } = await supabase
          .from("custodia")
          .select("id, codigo_custodia, nome, data_inicio, data_calculo, preco_unitario, resgate_total, valor_investido, quantidade, categoria_id, produto_id, instituicao_id, vencimento, produtos(nome), instituicoes(nome)")
          .eq("user_id", user.id)
          .eq("categoria_id", catData.id);

        const mapped: CustodiaProduct[] = (custodiaData || []).map((r: any) => ({
          id: r.id,
          codigo_custodia: r.codigo_custodia,
          nome: r.nome,
          data_inicio: r.data_inicio,
          data_calculo: r.data_calculo,
          preco_unitario: r.preco_unitario != null ? Number(r.preco_unitario) : null,
          resgate_total: r.resgate_total,
          valor_investido: Number(r.valor_investido),
          quantidade: r.quantidade != null ? Number(r.quantidade) : null,
          instituicao_nome: r.instituicoes?.nome || "—",
          categoria_id: r.categoria_id,
          produto_id: r.produto_id,
          produto_nome: r.produtos?.nome || "",
          vencimento: r.vencimento,
        }));

        // REGRA GLOBAL: ativo só aparece se data_inicio <= dataRef
        const produtosValidos = mapped.filter(p => dataReferenciaISO >= p.data_inicio);

        const effectiveDataCalculo = dataReferenciaISO;

        const info: CarteiraInfo = cartData ? {
          nome_carteira: cartData.nome_carteira,
          status: cartData.status,
          data_inicio: cartData.data_inicio,
          data_calculo: effectiveDataCalculo,
          data_limite: cartData.data_limite,
          resgate_total: cartData.resgate_total,
        } : {
          nome_carteira: "Câmbio",
          status: produtosValidos.length > 0 ? "Ativa" : "Não Iniciada",
          data_inicio: produtosValidos.length > 0 ? produtosValidos.reduce((min, p) => p.data_inicio < min ? p.data_inicio : min, produtosValidos[0].data_inicio) : null,
          data_calculo: effectiveDataCalculo,
          data_limite: null,
          resgate_total: null,
        };
        setCarteiraInfo(info);

        if (produtosValidos.length === 0 || !info.data_inicio || info.status === "Não Iniciada") {
          setCarteiraRows([]);
          setProductAnalyses([]);
          setProductList([]);
          setCdiRecords([]);
          setLoading(false);
          _cambioCachedVersion = appliedVersion;
          return;
        }

        const dataInicio = info.data_inicio;
        const dataCalculo = effectiveDataCalculo;
        const minDate = produtosValidos.reduce((min, p) => p.data_inicio < min ? p.data_inicio : min, produtosValidos[0].data_inicio);
        const allCodigos = produtosValidos.map(p => p.codigo_custodia);

        const needsDolar = produtosValidos.some(p => !p.produto_nome.toLowerCase().includes("euro"));
        const needsEuro = produtosValidos.some(p => p.produto_nome.toLowerCase().includes("euro"));

        const [calRes, cdiRes, dolarRes, euroRes, movRes] = await Promise.all([
          supabase.from("calendario_dias_uteis").select("data, dia_util").gte("data", getDateMinus(minDate, 5)).lte("data", dataCalculo).order("data"),
          supabase.from("historico_cdi").select("data, taxa_anual").gte("data", dataInicio).lte("data", dataCalculo).order("data"),
          needsDolar
            ? supabase.from("historico_dolar").select("data, cotacao_venda").gte("data", getDateMinus(minDate, 5)).lte("data", dataCalculo).order("data")
            : Promise.resolve({ data: [] }),
          needsEuro
            ? supabase.from("historico_euro").select("data, cotacao_venda").gte("data", getDateMinus(minDate, 5)).lte("data", dataCalculo).order("data")
            : Promise.resolve({ data: [] }),
          supabase.from("movimentacoes").select("data, tipo_movimentacao, valor, preco_unitario, quantidade, codigo_custodia").in("codigo_custodia", allCodigos).eq("user_id", user!.id).order("data"),
        ]);

        if (myVersion !== calcVersionRef.current) { setLoading(false); return; }

        const calendario = (calRes.data || []).map((c: any) => ({ data: c.data, dia_util: c.dia_util }));
        const cdiRaw = (cdiRes.data || []).map((c: any) => ({ data: c.data, taxa_anual: Number(c.taxa_anual) }));
        const dolarRecords = ((dolarRes as any).data || []).map((d: any) => ({ data: d.data, cotacao_venda: Number(d.cotacao_venda) }));
        const euroRecords = ((euroRes as any).data || []).map((d: any) => ({ data: d.data, cotacao_venda: Number(d.cotacao_venda) }));

        const calMap = new Map<string, boolean>();
        calendario.forEach(c => calMap.set(c.data, c.dia_util));
        const mergedCdi: CdiRecord[] = cdiRaw.map(r => ({
          ...r,
          dia_util: calMap.get(r.data) ?? false,
        }));
        setCdiRecords(mergedCdi);

        const movByCodigo = new Map<number, any[]>();
        for (const m of (movRes.data || [])) {
          const code = m.codigo_custodia as number;
          if (!movByCodigo.has(code)) movByCodigo.set(code, []);
          movByCodigo.get(code)!.push({ data: m.data, tipo_movimentacao: m.tipo_movimentacao, valor: Number(m.valor), preco_unitario: m.preco_unitario != null ? Number(m.preco_unitario) : null, quantidade: m.quantidade != null ? Number(m.quantidade) : null });
        }

        // Compute per-product daily rows
        const analyses: ProductAnalysis[] = [];
        const allProdRows: { data: string; diaUtil: boolean; liquido: number; aplicacoes: number; resgates: number; saldoCotas: number; ganhoAcumulado: number; ganhoDiario: number; rentabilidadeDiaria: number | null }[][] = [];

        for (const product of produtosValidos) {
          const isEuro = product.produto_nome.toLowerCase().includes("euro");
          const cotacaoRecords = isEuro ? euroRecords : dolarRecords;
          const rows = calcularCambioDiario({
            dataInicio: product.data_inicio,
            dataCalculo: dataCalculo,
            cotacaoInicial: product.preco_unitario || 1,
            calendario,
            movimentacoes: movByCodigo.get(product.codigo_custodia) || [],
            historicoCotacao: cotacaoRecords,
            dataResgateTotal: product.resgate_total,
          });
          analyses.push({ product, rows });

          // Adapt CambioDailyRow to the common format for carteiraRendaFixaEngine
          const adaptedRows = rows.map(r => ({
            data: r.data,
            diaUtil: r.diaUtil,
            liquido: r.valorBRL,
            aplicacoes: r.aplicacoesBRL,
            resgates: r.resgatesBRL,
            saldoCotas: r.quantidadeMoeda,
            ganhoAcumulado: r.rentAcumuladaBRL,
            ganhoDiario: r.ganhoDiarioBRL,
            rentabilidadeDiaria: r.rentDiariaPct,
          }));
          allProdRows.push(adaptedRows);
        }
        setProductAnalyses(analyses);

        // Build product list (same pattern as Renda Fixa)
        const pList = produtosValidos.map((product, idx) => {
          const rows = analyses[idx]?.rows || [];
          const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
          const isEncerrado = product.resgate_total
            ? product.resgate_total <= dataCalculo
            : false; // Câmbio has no vencimento end
          const currencyCode = getCurrencyCode(product.produto_nome);
          return {
            nome: product.nome || product.produto_nome,
            valorAtualizado: isEncerrado ? 0 : (lastRow?.valorBRL ?? 0),
            ganhoFinanceiro: lastRow?.rentAcumuladaBRL ?? 0,
            rentabilidade: lastRow ? lastRow.rentAcumuladaPct * 100 : 0,
            custodiante: product.instituicao_nome,
            ativo: !isEncerrado,
            quantidade: lastRow?.quantidadeMoeda ?? (product.quantidade || 0),
            cotacao: lastRow?.cotacao || product.preco_unitario || 0,
            currencyCode,
            product,
          };
        });
        setProductList(pList);

        if (myVersion !== calcVersionRef.current) { setLoading(false); return; }

        // Compute carteira TWR using carteiraRendaFixaEngine
        const carteiraResult = calcularCarteiraRendaFixa({
          productRows: allProdRows as any,
          calendario,
          dataInicio,
          dataCalculo,
        });
        setCarteiraRows(carteiraResult);

        if (myVersion !== calcVersionRef.current) return;

        _cambioCachedVersion = appliedVersion;
        _cambioCached = { carteiraInfo: info, carteiraRows: carteiraResult, productAnalyses: analyses, cdiRecords: mergedCdi, productList: pList };
      } catch (err) {
        console.error("Erro ao carregar carteira Câmbio:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [user, appliedVersion]);

  // Chart data
  const chartData = useMemo(() => {
    if (!carteiraInfo?.data_inicio || carteiraRows.length === 0) return [];

    const cdiSeries = buildCdiSeries(cdiRecords, carteiraInfo.data_inicio, carteiraInfo.data_calculo ?? undefined);

    const enginePoints = carteiraRows
      .filter(r => r.liquido > 0)
      .map(r => ({
        data: r.data,
        label: new Date(r.data + "T00:00:00").toLocaleDateString("pt-BR"),
        titulo_acumulado: parseFloat((r.rentAcumuladaPct * 100).toFixed(4)),
      }));

    const map = new Map<string, any>();
    for (const p of cdiSeries) {
      map.set(p.data, { data: p.data, label: p.label, cdi_acumulado: p.cdi_acumulado });
    }
    for (const p of enginePoints) {
      const existing = map.get(p.data) || { data: p.data, label: p.label };
      existing.titulo_acumulado = p.titulo_acumulado;
      existing.label = existing.label || p.label;
      map.set(p.data, existing);
    }
    return Array.from(map.values()).sort((a: any, b: any) => a.data.localeCompare(b.data));
  }, [carteiraRows, cdiRecords, carteiraInfo]);

  // Detail rows for RentabilidadeDetailTable
  const detailRows = useMemo(() => {
    if (productAnalyses.length === 0 || !carteiraInfo?.data_inicio || !carteiraInfo?.data_calculo) return [];

    const dateMap = new Map<string, {
      data: string; diaUtil: boolean; liquido: number; aplicacoes: number;
      resgates: number; jurosPago: number; saldoCotas: number;
      ganhoAcumulado: number; ganhoDiario: number; rentabilidadeDiaria: number | null;
    }>();

    for (const analysis of productAnalyses) {
      for (const row of analysis.rows) {
        if (row.data < carteiraInfo.data_inicio! || row.data > carteiraInfo.data_calculo!) continue;
        const existing = dateMap.get(row.data);
        if (existing) {
          existing.liquido += row.valorBRL;
          existing.aplicacoes += row.aplicacoesBRL;
          existing.resgates += row.resgatesBRL;
          existing.saldoCotas += row.quantidadeMoeda;
          existing.ganhoDiario += row.ganhoDiarioBRL;
        } else {
          dateMap.set(row.data, {
            data: row.data,
            diaUtil: row.diaUtil,
            liquido: row.valorBRL,
            aplicacoes: row.aplicacoesBRL,
            resgates: row.resgatesBRL,
            jurosPago: 0,
            saldoCotas: row.quantidadeMoeda,
            ganhoAcumulado: 0,
            ganhoDiario: row.ganhoDiarioBRL,
            rentabilidadeDiaria: null,
          });
        }
      }
    }

    const merged = Array.from(dateMap.values()).sort((a, b) => a.data.localeCompare(b.data));
    const carteiraMap = new Map<string, CarteiraRFRow>();
    carteiraRows.forEach(r => carteiraMap.set(r.data, r));

    let ganhoAcum = 0;
    for (const row of merged) {
      ganhoAcum += row.ganhoDiario;
      row.ganhoAcumulado = ganhoAcum;
      const cr = carteiraMap.get(row.data);
      row.rentabilidadeDiaria = cr ? cr.rentDiariaPct : null;
    }

    return buildDetailRowsFromEngine(merged, cdiRecords, carteiraInfo.data_inicio!);
  }, [productAnalyses, carteiraRows, cdiRecords, carteiraInfo]);

  const fmtBrl = (v: number | null) =>
    v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
  const fmtDate = (d: string | null) =>
    d ? new Date(d + "T00:00:00").toLocaleDateString("pt-BR") : "—";

  const showContent = carteiraInfo && (carteiraInfo.status === "Ativa" || carteiraInfo.status === "Encerrada") && carteiraRows.length > 0;

  const statusBadge = carteiraInfo ? (
    carteiraInfo.status === "Ativa" ? (
      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Ativa</Badge>
    ) : carteiraInfo.status === "Encerrada" ? (
      <Badge variant="destructive">Encerrada</Badge>
    ) : (
      <Badge variant="secondary">Não Iniciada</Badge>
    )
  ) : null;

  // Product detail view
  if (selectedProduct) {
    const analysis = productAnalyses.find(a => a.product.id === selectedProduct.id);
    const rows = analysis?.rows || [];
    const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
    const currencyCode = getCurrencyCode(selectedProduct.produto_nome);

    const detailChartData = rows
      .filter((_, i) => i % Math.max(1, Math.floor(rows.length / 120)) === 0 || _ === rows[rows.length - 1])
      .map(r => ({
        data: new Date(r.data + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
        "Rentabilidade": +(r.rentAcumuladaPct * 100).toFixed(2),
      }));

    return (
      <div className="space-y-6">
        <div>
          <button
            onClick={() => setSelectedProduct(null)}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft size={16} />
            Voltar para Carteira Câmbio
          </button>
          <h1 className="text-lg font-semibold text-foreground">{selectedProduct.nome || selectedProduct.produto_nome}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {selectedProduct.instituicao_nome} · Início: {fmtDate(selectedProduct.data_inicio)}
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Patrimônio", value: lastRow ? fmtBrl(lastRow.valorBRL) : "—" },
            { label: "Ganho Acumulado", value: lastRow ? fmtBrl(lastRow.rentAcumuladaBRL) : "—" },
            { label: "Rentabilidade", value: lastRow ? `${(lastRow.rentAcumuladaPct * 100).toFixed(2)}%` : "—" },
            { label: `Quantidade (${currencyCode})`, value: lastRow ? lastRow.quantidadeMoeda.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 6 }) : "—" },
          ].map(c => (
            <div key={c.label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
              <p className="text-lg font-semibold text-foreground">{c.value}</p>
            </div>
          ))}
        </div>

        {detailChartData.length > 1 && (
          <div className="rounded-md border border-border bg-card p-6">
            <h2 className="text-sm font-semibold text-foreground mb-3">Evolução da Rentabilidade</h2>
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={detailChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="data" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip content={<CustomTooltipChart />} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Rentabilidade" stroke="hsl(210, 100%, 45%)" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Câmbio</h1>
        {carteiraInfo && (
          carteiraInfo.status === "Não Iniciada" ? (
            <p className="text-sm text-muted-foreground mt-1">
              Data selecionada anterior ao início dos seus investimentos em Câmbio
            </p>
          ) : (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Período de Análise: De {fmtDate(carteiraInfo.data_inicio)} a {fmtDate(carteiraInfo.data_calculo)}
              </p>
              {statusBadge}
            </div>
          )
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      ) : !showContent ? (
        <div className="rounded-md border border-border p-8 text-center text-muted-foreground">
          Nenhum dado disponível para o período selecionado.
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          {(() => {
            let patrimonioValue: number | null = null;
            let rentValue: number | null = null;
            let ganhoValue: number | null = null;

            for (let i = carteiraRows.length - 1; i >= 0; i--) {
              if (carteiraRows[i].data <= dataReferenciaISO) {
                patrimonioValue = carteiraRows[i].liquido;
                rentValue = parseFloat((carteiraRows[i].rentAcumuladaPct * 100).toFixed(2));
                ganhoValue = carteiraRows[i].rentAcumuladaRS;
                break;
              }
            }

            const cdiAcum = detailRows.length > 0 ? detailRows[0].cdiAcumulado : null;
            const fmtPct = (v: number | null) =>
              v != null ? `${v.toFixed(2)}%` : "—";

            const cards = [
              { label: "Patrimônio", value: fmtBrl(patrimonioValue) },
              { label: "Ganho Financeiro", value: fmtBrl(ganhoValue) },
              { label: "Rentabilidade", value: fmtPct(rentValue) },
              { label: "CDI Acumulado", value: fmtPct(cdiAcum) },
            ];

            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {cards.map((c) => (
                  <div key={c.label} className="rounded-lg border border-border bg-card p-4 shadow-sm">
                    <p className="text-xs text-muted-foreground mb-1">{c.label}</p>
                    <p className="text-lg font-semibold text-foreground">{c.value}</p>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                    <Line type="monotone" dataKey="titulo_acumulado" name="Carteira Câmbio" stroke="hsl(210, 100%, 45%)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls />
                    {seriesVisibility.cdi && (
                      <Line type="monotone" dataKey="cdi_acumulado" name="CDI" stroke="hsl(0, 0%, 55%)" strokeWidth={1.5} dot={false} activeDot={{ r: 3, strokeWidth: 0 }} strokeDasharray="5 3" connectNulls />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-md border border-border bg-card p-6">
              <h2 className="text-sm font-semibold text-foreground">Patrimônio Mensal</h2>
              <p className="mt-1 text-xs text-muted-foreground">Evolução do patrimônio por mês (R$)</p>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={(() => {
                    const MONTH_LABELS = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
                    const barData: { mes: string; patrimonio: number }[] = [];
                    const chronRows = [...detailRows].reverse();
                    for (const row of chronRows) {
                      for (let m = 0; m < 12; m++) {
                        if (row.patrimonioMonths[m] !== null) {
                          barData.push({ mes: `${MONTH_LABELS[m]}/${String(row.year).slice(2)}`, patrimonio: row.patrimonioMonths[m]! });
                        }
                      }
                    }
                    return barData;
                  })()}>
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

          {/* Detail Table */}
          <RentabilidadeDetailTable rows={detailRows} tituloLabel="Rentabilidade" />

          {/* Posição Consolidada */}
          {productList.length > 0 && (
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-foreground">Posição Consolidada</h2>
              <div className="rounded-lg border bg-card">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[50px]">Status</TableHead>
                      <TableHead className="min-w-[250px]">Ativo</TableHead>
                      <TableHead className="min-w-[100px] text-right">Quantidade</TableHead>
                      <TableHead className="min-w-[100px] text-right">Cotação</TableHead>
                      <TableHead className="min-w-[130px] text-right">Valor Atualizado</TableHead>
                      <TableHead className="min-w-[130px] text-right">Ganho Financeiro</TableHead>
                      <TableHead className="min-w-[110px] text-right">Rentabilidade</TableHead>
                      <TableHead className="min-w-[150px]">Custodiante</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productList.map((row, i) => (
                      <TableRow key={i} className="cursor-pointer hover:bg-accent/50" onClick={() => setSelectedProduct(row.product)}>
                        <TableCell>
                          <Badge
                            variant={row.ativo ? "default" : "secondary"}
                            className={row.ativo ? "bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] px-2 py-0.5" : "bg-muted text-muted-foreground text-[10px] px-2 py-0.5"}
                          >
                            {row.ativo ? "Em custódia" : "Liquidado"}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium text-foreground">{row.nome}</TableCell>
                        <TableCell className="text-xs text-right text-foreground">
                          {row.quantidade.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {row.currencyCode}
                        </TableCell>
                        <TableCell className="text-xs text-right text-foreground">R$ {row.cotacao.toFixed(4)}</TableCell>
                        <TableCell className="text-right text-foreground">{fmtBrl(row.valorAtualizado)}</TableCell>
                        <TableCell className="text-right text-foreground">{fmtBrl(row.ganhoFinanceiro)}</TableCell>
                        <TableCell className="text-right text-foreground">{row.rentabilidade.toFixed(2)}%</TableCell>
                        <TableCell className="text-foreground">{row.custodiante}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
