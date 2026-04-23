import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Wallet, TrendingUp, TrendingDown } from "lucide-react";

interface Conta {
  id: string;
  nome: string;
  saldo_inicial: number;
  data_inicio: string;
}

interface Lanc {
  id: string;
  conta_id: string;
  tipo: "credito" | "debito";
  valor: number;
  data: string;
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function FinancasDashboardPage() {
  const { user } = useAuth();
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancs, setLancs] = useState<Lanc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [{ data: c }, { data: l }] = await Promise.all([
        supabase.from("fp_contas" as any).select("id,nome,saldo_inicial,data_inicio").eq("user_id", user.id),
        supabase.from("fp_lancamentos" as any).select("id,conta_id,tipo,valor,data").eq("user_id", user.id),
      ]);
      setContas((c as any) ?? []);
      setLancs((l as any) ?? []);
      setLoading(false);
    })();
  }, [user]);

  const { saldoTotal, totalCred, totalDeb, saldoPorConta } = useMemo(() => {
    const map = new Map<string, number>();
    contas.forEach((c) => map.set(c.id, Number(c.saldo_inicial) || 0));
    let cred = 0;
    let deb = 0;
    lancs.forEach((l) => {
      const v = Number(l.valor) || 0;
      if (l.tipo === "credito") cred += v;
      else deb += v;
      const cur = map.get(l.conta_id) ?? 0;
      map.set(l.conta_id, cur + (l.tipo === "credito" ? v : -v));
    });
    let total = 0;
    map.forEach((v) => (total += v));
    return { saldoTotal: total, totalCred: cred, totalDeb: deb, saldoPorConta: map };
  }, [contas, lancs]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Finanças Pessoais</h1>
          <p className="text-sm text-muted-foreground">Visão geral das suas contas e movimentações</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/financas/contas">Contas Correntes</Link>
          </Button>
          <Button asChild>
            <Link to="/financas/lancamentos">
              <Plus className="mr-2 h-4 w-4" /> Novo lançamento
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Saldo total</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{fmtBRL(saldoTotal)}</div>
            <p className="text-xs text-muted-foreground">{contas.length} conta(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Créditos</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-emerald-600">{fmtBRL(totalCred)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Débitos</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-rose-600">{fmtBRL(totalDeb)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saldo por conta</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : contas.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Nenhuma conta cadastrada.{" "}
              <Link to="/financas/contas" className="text-primary underline">
                Cadastrar agora
              </Link>
              .
            </div>
          ) : (
            <ul className="divide-y">
              {contas.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <span className="text-sm">{c.nome}</span>
                  <span className="text-sm font-medium">{fmtBRL(saldoPorConta.get(c.id) ?? 0)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
