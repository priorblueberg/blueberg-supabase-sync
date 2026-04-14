import { useEffect, useState, useRef, useMemo } from "react";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { format, subDays, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { calcularRendaFixaDiario } from "@/lib/rendaFixaEngine";
import { fetchIpcaRecordsBatch } from "@/lib/ipcaHelper";
import { calcularPoupancaDiario, buildPoupancaLotesFromMovs } from "@/lib/poupancaEngine";
import { cacheRFResult, getCachedRFResult, buildMovsHash } from "@/lib/engineCache";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";

// ── Types ──
interface ProventoRow {
  data: string;
  nome: string;
  tipo: string;
  valor: number;
}

type SortField = keyof ProventoRow;
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortField; label: string }[] = [
  { key: "data", label: "Data" },
  { key: "nome", label: "Nome" },
  { key: "tipo", label: "Tipo" },
  { key: "valor", label: "Valor Recebido" },
];

const PAGE_SIZE = 10;

function getDateMinus(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const fmtDate = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString("pt-BR");

const fmtBrl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Fixed D-1 date (independent of global selector)
const DATA_REF = format(subDays(new Date(), 1), "yyyy-MM-dd");

// ── Chart colors (using CSS vars mapped to hsl) ──
const CHART_COLORS = [
  "hsl(210, 100%, 45%)",  // primary blue
  "hsl(160, 60%, 45%)",   // green
  "hsl(30, 90%, 55%)",    // orange
  "hsl(280, 60%, 55%)",   // purple
  "hsl(350, 70%, 55%)",   // red
];

export default function ProventosRecebidosPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ProventoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>("data");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filtroAtivo, setFiltroAtivo] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [page, setPage] = useState(1);
  const calcVersionRef = useRef(0);

  // ── Data loading ──
  useEffect(() => {
    if (!user) return;
    calcVersionRef.current += 1;
    const myVersion = calcVersionRef.current;
    const dataRef = DATA_REF;

    (async () => {
      setLoading(true);

      const { data: custodias } = await supabase
        .from("custodia")
        .select("codigo_custodia, nome, data_inicio, data_calculo, taxa, modalidade, preco_unitario, resgate_total, pagamento, vencimento, categoria_id, indexador, categorias(nome)")
        .eq("user_id", user.id);

      if (!custodias || custodias.length === 0) {
        setRows([]); setLoading(false); return;
      }

      // ALL renda fixa products (not just periodic)
      const rfProducts = custodias.filter(
        (c: any) => c.categorias?.nome === "Renda Fixa" || (!c.categorias && c.modalidade !== "Poupança")
      );
      const poupancaProducts = custodias.filter(
        (c: any) => c.modalidade === "Poupança"
      );

      if (rfProducts.length === 0 && poupancaProducts.length === 0) {
        setRows([]); setLoading(false); return;
      }

      const allProducts = [...rfProducts, ...poupancaProducts];
      const minDate = allProducts.reduce((m: string, p: any) => p.data_inicio < m ? p.data_inicio : m, allProducts[0].data_inicio);
      const maxDate = allProducts.reduce((m: string, p: any) => {
        const end = p.data_calculo || dataRef;
        return end > m ? end : m;
      }, dataRef);

      const allCodigos = allProducts.map((p: any) => p.codigo_custodia);
      const poupancaCodigos = poupancaProducts.map((p: any) => p.codigo_custodia);
      const needsCdi = rfProducts.some((p: any) => {
        const idx = (p.indexador || "").toUpperCase();
        return idx === "CDI" || idx === "CDI+";
      });

      const [calRes, allMovRes, selicRes, , trRes, poupRendRes, cdiRes] = await Promise.all([
        supabase.from("calendario_dias_uteis").select("data, dia_util")
          .gte("data", getDateMinus(minDate, 5)).lte("data", maxDate).order("data"),
        supabase.from("movimentacoes").select("data, tipo_movimentacao, valor, codigo_custodia")
          .in("codigo_custodia", allCodigos).eq("user_id", user.id).order("data"),
        poupancaCodigos.length > 0
          ? supabase.from("historico_selic").select("data, taxa_anual").gte("data", getDateMinus(minDate, 5)).lte("data", maxDate).order("data")
          : Promise.resolve({ data: [] }),
        Promise.resolve({ data: [] }),
        poupancaCodigos.length > 0
          ? supabase.from("historico_tr").select("data, taxa_mensal").gte("data", getDateMinus(minDate, 5)).lte("data", maxDate).order("data")
          : Promise.resolve({ data: [] }),
        poupancaCodigos.length > 0
          ? supabase.from("historico_poupanca_rendimento").select("data, rendimento_mensal").gte("data", getDateMinus(minDate, 5)).lte("data", maxDate).order("data")
          : Promise.resolve({ data: [] }),
        needsCdi
          ? supabase.from("historico_cdi").select("data, taxa_anual").gte("data", getDateMinus(minDate, 5)).lte("data", maxDate).order("data")
          : Promise.resolve({ data: [] }),
      ]);

      const calendario = (calRes.data || []).map((d: any) => ({ data: d.data, dia_util: d.dia_util }));
      const movByCodigo = new Map<number, { data: string; tipo_movimentacao: string; valor: number }[]>();
      for (const m of (allMovRes.data || [])) {
        const code = m.codigo_custodia as number;
        if (!movByCodigo.has(code)) movByCodigo.set(code, []);
        movByCodigo.get(code)!.push({ data: m.data, tipo_movimentacao: m.tipo_movimentacao, valor: Number(m.valor) });
      }

      const allProventos: ProventoRow[] = [];

      // 1. Renda Fixa — ALL products
      const ipcaData = await fetchIpcaRecordsBatch(rfProducts, dataRef);
      if (myVersion !== calcVersionRef.current) { setLoading(false); return; }

      for (const prod of rfProducts) {
        const endDate = (prod as any).data_calculo || dataRef;
        const productMovs = movByCodigo.get(prod.codigo_custodia) || [];
        const movsHash = buildMovsHash(productMovs);

        const cacheParams = {
          dataInicio: prod.data_inicio,
          taxa: prod.taxa || 0,
          modalidade: prod.modalidade || "Prefixado",
          puInicial: prod.preco_unitario || 1000,
          pagamento: prod.pagamento,
          vencimento: prod.vencimento,
          indexador: (prod as any).indexador,
          dataResgateTotal: prod.resgate_total,
          dataLimite: null,
          movsHash,
        };

        let engineRows = getCachedRFResult(prod.codigo_custodia, endDate, cacheParams);

        if (!engineRows) {
          const prodIndexador = (prod as any).indexador || "";
          const prodIndexadorUpper = prodIndexador.toUpperCase();
          const isCdi = prodIndexadorUpper === "CDI" || prodIndexadorUpper === "CDI+";
          const cdiRecords = isCdi
            ? ((cdiRes as any).data || []).map((r: any) => ({ data: r.data, taxa_anual: Number(r.taxa_anual) }))
            : undefined;
          const fullRows = calcularRendaFixaDiario({
            dataInicio: prod.data_inicio,
            dataCalculo: endDate,
            taxa: prod.taxa || 0,
            modalidade: prod.modalidade || "Prefixado",
            puInicial: prod.preco_unitario || 1000,
            calendario,
            movimentacoes: productMovs,
            dataResgateTotal: prod.resgate_total,
            pagamento: prod.pagamento,
            vencimento: prod.vencimento,
            calendarioSorted: true,
            indexador: prodIndexador,
            ipcaOficialRecords: prodIndexadorUpper === "IPCA" ? ipcaData?.oficial : undefined,
            ipcaProjecaoRecords: prodIndexadorUpper === "IPCA" ? ipcaData?.projecao : undefined,
            cdiRecords,
          });
          cacheRFResult(prod.codigo_custodia, fullRows, cacheParams);
          engineRows = fullRows;
        }

        for (const row of engineRows) {
          if (row.pagamentoJuros > 0.01) {
            allProventos.push({
              data: row.data,
              nome: prod.nome || "—",
              tipo: "Rendimentos",
              valor: row.pagamentoJuros,
            });
          }
        }
      }

      // 2. Poupança
      const selicRecords = ((selicRes as any).data || []).map((s: any) => ({ data: s.data, taxa_anual: Number(s.taxa_anual) }));
      const trRecords = ((trRes as any).data || []).map((t: any) => ({ data: t.data, taxa_mensal: Number(t.taxa_mensal) }));
      const poupancaRendimentoRecords = ((poupRendRes as any).data || []).map((r: any) => ({ data: r.data, rendimento_mensal: Number(r.rendimento_mensal) }));

      for (const prod of poupancaProducts) {
        const allMovs = movByCodigo.get((prod as any).codigo_custodia) || [];
        const lotesForEngine = buildPoupancaLotesFromMovs(allMovs);
        if (lotesForEngine.length === 0) continue;

        const engineRows = calcularPoupancaDiario({
          dataInicio: lotesForEngine[0].data_aplicacao,
          dataCalculo: dataRef,
          calendario,
          movimentacoes: allMovs,
          lotes: lotesForEngine,
          selicRecords,
          trRecords,
          poupancaRendimentoRecords,
          dataResgateTotal: (prod as any).resgate_total,
        });

        for (const row of engineRows) {
          if (row.ganhoDiario > 0.01) {
            allProventos.push({
              data: row.data,
              nome: (prod as any).nome || "Poupança",
              tipo: "Rendimentos",
              valor: row.ganhoDiario,
            });
          }
        }
      }

      if (myVersion !== calcVersionRef.current) return;
      setRows(allProventos);
      setLoading(false);
    })();
  }, [user]);

  // ── Sorting ──
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  // ── Unique filter options ──
  const nomesUnicos = useMemo(() => [...new Set(rows.map((r) => r.nome))].sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);
  const tiposUnicos = useMemo(() => [...new Set(rows.map((r) => r.tipo))].sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);

  // ── Filtering ──
  const filteredRows = useMemo(() => {
    let result = rows;
    if (filtroAtivo) result = result.filter((r) => r.nome === filtroAtivo);
    if (filtroTipo) result = result.filter((r) => r.tipo === filtroTipo);
    return result;
  }, [rows, filtroAtivo, filtroTipo]);

  // ── Sorting ──
  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const valA = a[sortField] ?? "";
      const valB = b[sortField] ?? "";
      if (typeof valA === "number" && typeof valB === "number") {
        return sortDir === "asc" ? valA - valB : valB - valA;
      }
      const cmp = String(valA).localeCompare(String(valB), "pt-BR", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredRows, sortField, sortDir]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = sortedRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [filtroAtivo, filtroTipo]);

  // ── Summary: last 12 months ──
  const { summaryByType, totalGeral12m, chartData } = useMemo(() => {
    const refDate = new Date(DATA_REF + "T00:00:00");
    const windowEnd = format(endOfMonth(refDate), "yyyy-MM-dd");
    const windowStart = format(startOfMonth(subMonths(refDate, 11)), "yyyy-MM-dd");

    const inWindow = rows.filter((r) => r.data >= windowStart && r.data <= windowEnd);

    // Totals by type
    const byType: Record<string, number> = {};
    for (const r of inWindow) {
      byType[r.tipo] = (byType[r.tipo] || 0) + r.valor;
    }
    const total = Object.values(byType).reduce((s, v) => s + v, 0);

    // Monthly chart data
    const monthMap = new Map<string, Record<string, number>>();
    const allTypes = new Set<string>();
    for (let i = 11; i >= 0; i--) {
      const m = subMonths(refDate, i);
      const key = format(m, "yyyy-MM");
      monthMap.set(key, {});
    }
    for (const r of inWindow) {
      const key = r.data.slice(0, 7);
      allTypes.add(r.tipo);
      if (monthMap.has(key)) {
        const bucket = monthMap.get(key)!;
        bucket[r.tipo] = (bucket[r.tipo] || 0) + r.valor;
      }
    }
    const chart: { month: string; [tipo: string]: number | string }[] = [];
    for (const [key, bucket] of monthMap) {
      const d = new Date(key + "-01T00:00:00");
      const label = format(d, "MMM/yy", { locale: ptBR });
      chart.push({ month: label.charAt(0).toUpperCase() + label.slice(1), ...bucket });
    }

    return {
      summaryByType: Object.entries(byType).sort((a, b) => b[1] - a[1]),
      totalGeral12m: total,
      chartData: { data: chart, types: [...allTypes] },
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Proventos Recebidos</h1>
          <p className="text-xs text-muted-foreground">Pagamentos e rendimentos dos seus títulos</p>
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          Data de Referência: {fmtDate(DATA_REF)}
        </span>
      </div>

      {/* Summary block - last 12 months */}
      {!loading && rows.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-foreground mb-3">Resumo (Últimos 12 meses)</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Card */}
            <Card>
              <CardContent className="pt-6 space-y-3">
                {summaryByType.map(([tipo, total]) => (
                  <div key={tipo} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{tipo}</span>
                    <span className="font-medium text-foreground">{fmtBrl(total)}</span>
                  </div>
                ))}
                <div className="border-t pt-3 flex justify-between text-sm font-semibold">
                  <span className="text-foreground">Total</span>
                  <span className="text-foreground">{fmtBrl(totalGeral12m)}</span>
                </div>
              </CardContent>
            </Card>

            {/* Chart */}
            <div className="lg:col-span-2 rounded-lg border bg-card p-4">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData.data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis
                    tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v))}
                    tick={{ fontSize: 11 }}
                    stroke="hsl(var(--muted-foreground))"
                    width={45}
                  />
                  <Tooltip
                    formatter={(value: number) => fmtBrl(value)}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  {chartData.types.map((tipo, i) => (
                    <Bar
                      key={tipo}
                      dataKey={tipo}
                      stackId="a"
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      radius={i === chartData.types.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Filters + Extrato */}
      <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-foreground">Extrato</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {nomesUnicos.length > 1 && (
              <select
                value={filtroAtivo}
                onChange={(e) => setFiltroAtivo(e.target.value)}
                className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Todos os ativos</option>
                {nomesUnicos.map((nome) => (
                  <option key={nome} value={nome}>{nome}</option>
                ))}
              </select>
            )}
            {tiposUnicos.length > 1 && (
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value)}
                className="flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Todos os tipos</option>
                {tiposUnicos.map((tipo) => (
                  <option key={tipo} value={tipo}>{tipo}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((col) => (
                  <TableHead
                    key={col.key}
                    className="cursor-pointer select-none whitespace-nowrap"
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      <ArrowUpDown size={12} className={sortField === col.key ? "opacity-100" : "opacity-40"} />
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS.length} className="text-center py-8 text-muted-foreground">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : pagedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={COLUMNS.length} className="text-center py-8 text-muted-foreground">
                    Nenhum provento encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                pagedRows.map((r, i) => (
                  <TableRow key={`${r.data}-${r.nome}-${i}`}>
                    <TableCell className="whitespace-nowrap">{fmtDate(r.data)}</TableCell>
                    <TableCell>{r.nome}</TableCell>
                    <TableCell>{r.tipo}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtBrl(r.valor)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-end gap-3 text-xs text-muted-foreground">
            <span>Página {safePage} de {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="p-1 rounded hover:bg-muted disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="p-1 rounded hover:bg-muted disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
