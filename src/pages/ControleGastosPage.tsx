import { useState } from "react";
import { ChevronRight, ChevronDown, TrendingUp, Calendar, BarChart3 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ── Mock data ──
const MOCK_KPIS = {
  totalAcumulado: 470857.7,
  mediaMensal: 117714.43,
  mesPico: { valor: 435233.17, mes: "Março" },
  periodoLabel: "01.JAN.2026 → 04.2026 • YTD",
  totalSubLabel: "Acumulado de janeiro a abril",
  mediaSubLabel: "Média de 4 meses",
};

const MOCK_MONTHLY: { mes: string; valor: number; projecao?: boolean }[] = [
  { mes: "JAN", valor: 11500 },
  { mes: "FEV", valor: 13700 },
  { mes: "MAR", valor: 435233 },
  { mes: "ABR", valor: 10600 },
  { mes: "MAI", valor: 0, projecao: true },
  { mes: "JUN", valor: 0, projecao: true },
  { mes: "JUL", valor: 0, projecao: true },
  { mes: "AGO", valor: 0, projecao: true },
  { mes: "SET", valor: 0, projecao: true },
  { mes: "OUT", valor: 0, projecao: true },
  { mes: "NOV", valor: 0, projecao: true },
  { mes: "DEZ", valor: 0, projecao: true },
];

const MOCK_CATEGORIAS = [
  { idx: 1, nome: "Outros", valor: 417680.38, pct: 88.7 },
  { idx: 2, nome: "Compras", valor: 11551.92, pct: 2.5 },
  { idx: 3, nome: "Saúde", valor: 9748.58, pct: 2.1 },
  { idx: 4, nome: "Alimentação", valor: 7747.99, pct: 1.6 },
  { idx: 5, nome: "Contas da Casa", valor: 6872.95, pct: 1.5 },
  { idx: 6, nome: "Lazer", valor: 5661.28, pct: 1.2 },
  { idx: 7, nome: "Assinaturas", valor: 4443.18, pct: 0.9 },
  { idx: 8, nome: "Educação", valor: 3877.18, pct: 0.8 },
  { idx: 9, nome: "Automóvel", valor: 3669.77, pct: 0.8 },
  { idx: 10, nome: "Transporte", valor: 278.88, pct: 0.1 },
  { idx: 11, nome: "Despesas Financeiras", valor: 141.75, pct: 0.0 },
];

const MOCK_SEGREGADAS = [
  {
    grupo: "Conta Maurício",
    total: 14000,
    itens: [
      { data: "2026-02-27", descricao: "Maurício Santiago de", categoria: "CC", valor: 4000 },
      { data: "2026-02-27", descricao: "Maurício Santiago de", categoria: "CC", valor: 7000 },
      { data: "2026-02-27", descricao: "Ursula Maria Santiago", categoria: "CC", valor: 3000 },
    ],
  },
];

const fmtBrl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtBrlShort = (v: number) =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);
const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR");

export default function ControleGastosPage() {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "Conta Maurício": true,
  });

  return (
    <div className="space-y-4 p-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Balanço de Despesas</h1>
        <Badge variant="outline" className="font-mono text-[10px] tracking-wider">
          PERÍODO • {MOCK_KPIS.periodoLabel}
        </Badge>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="TOTAL CONSUMO ACUMULADO"
          value={fmtBrl(MOCK_KPIS.totalAcumulado)}
          sublabel={MOCK_KPIS.totalSubLabel}
        />
        <KpiCard
          icon={<BarChart3 className="h-3.5 w-3.5" />}
          label="MÉDIA MENSAL"
          value={fmtBrl(MOCK_KPIS.mediaMensal)}
          sublabel={MOCK_KPIS.mediaSubLabel}
        />
        <KpiCard
          icon={<Calendar className="h-3.5 w-3.5" />}
          label="MÊS DE PICO"
          value={fmtBrl(MOCK_KPIS.mesPico.valor)}
          sublabel={MOCK_KPIS.mesPico.mes}
        />
      </div>

      {/* Despesas Mensais */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">■ Despesas Mensais</h2>
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
              JAN — DEZ • YTD
            </span>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={MOCK_MONTHLY} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => fmtBrlShort(v)}
                />
                <Tooltip
                  formatter={(v: number) => fmtBrl(v)}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <ReferenceLine
                  y={MOCK_KPIS.mediaMensal}
                  stroke="hsl(var(--destructive))"
                  strokeDasharray="4 4"
                  label={{
                    value: `MÉDIA: ${fmtBrlShort(MOCK_KPIS.mediaMensal)}`,
                    position: "insideTopLeft",
                    fill: "hsl(var(--destructive))",
                    fontSize: 10,
                  }}
                />
                <Bar dataKey="valor" radius={[3, 3, 0, 0]}>
                  {MOCK_MONTHLY.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry.projecao ? "hsl(var(--muted))" : "hsl(var(--primary))"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-[10px] text-muted-foreground">
            <LegendDot color="hsl(var(--primary))" label="Total Mensal" />
            <LegendDot color="hsl(var(--destructive))" label="Média Acumulada" dashed />
            <LegendDot color="hsl(var(--muted))" label="Projeção" />
          </div>
        </CardContent>
      </Card>

      {/* Detalhamento por Categoria */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 className="text-sm font-semibold text-foreground">■ Detalhamento por Categoria</h2>
            <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
              CLIQUE PARA EXPANDIR
            </span>
          </div>
          <div className="divide-y divide-border">
            {MOCK_CATEGORIAS.map((cat) => (
              <button
                key={cat.idx}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs hover:bg-muted/40"
              >
                <span className="w-6 font-mono text-[10px] text-muted-foreground">
                  {String(cat.idx).padStart(2, "0")}
                </span>
                <span className="w-44 truncate font-medium text-foreground">{cat.nome}</span>
                <div className="flex-1">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(cat.pct, 0.5)}%` }}
                    />
                  </div>
                </div>
                <span className="w-14 text-right text-[11px] text-muted-foreground">
                  {cat.pct.toFixed(1)}%
                </span>
                <span className="w-32 text-right font-medium text-foreground">
                  {fmtBrl(cat.valor)}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Movimentações Segregadas */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 className="text-sm font-semibold text-foreground">■ Movimentações Segregadas</h2>
            <Badge variant="outline" className="border-amber-500/50 text-amber-600 font-mono text-[10px] tracking-wider">
              NÃO CONTABILIZADAS NO TOTAL
            </Badge>
          </div>
          {MOCK_SEGREGADAS.map((g) => {
            const open = openGroups[g.grupo] ?? true;
            return (
              <div key={g.grupo}>
                <button
                  onClick={() =>
                    setOpenGroups((prev) => ({ ...prev, [g.grupo]: !open }))
                  }
                  className="flex w-full items-center justify-between border-b border-border bg-muted/30 px-4 py-2.5 text-xs"
                >
                  <span className="flex items-center gap-2 font-semibold text-foreground">
                    {open ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    {g.grupo}
                  </span>
                  <span className="font-medium text-foreground">{fmtBrl(g.total)}</span>
                </button>
                {open && (
                  <div className="divide-y divide-border">
                    {g.itens.map((it, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground"
                      >
                        <span className="w-24 font-mono text-[10px]">{fmtDate(it.data)}</span>
                        <span className="flex-1 truncate text-foreground">{it.descricao}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {it.categoria}
                        </Badge>
                        <span className="w-32 text-right font-medium text-foreground">
                          {fmtBrl(it.valor)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sublabel: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 flex items-center gap-1.5 font-mono text-[10px] tracking-wider text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-2xl font-bold text-primary">{value}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">{sublabel}</div>
      </CardContent>
    </Card>
  );
}

function LegendDot({
  color,
  label,
  dashed = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      {dashed ? (
        <span
          className="inline-block h-0 w-4 border-t-2 border-dashed"
          style={{ borderColor: color }}
        />
      ) : (
        <span className="inline-block h-2 w-2 rounded-sm" style={{ background: color }} />
      )}
      <span>{label}</span>
    </span>
  );
}
