import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Conta {
  id: string;
  nome: string;
  banco: string | null;
  data_inicio: string;
  saldo_inicial: number;
  ativa: boolean;
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ContasCorrentesPage() {
  const { user } = useAuth();
  const [contas, setContas] = useState<Conta[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome: "",
    banco: "",
    data_inicio: new Date().toISOString().slice(0, 10),
    saldo_inicial: "0",
  });

  const load = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("fp_contas" as any)
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setContas((data as any) ?? []);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.nome.trim()) {
      toast.error("Informe o nome da conta");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("fp_contas" as any).insert({
      user_id: user.id,
      nome: form.nome.trim(),
      banco: form.banco.trim() || null,
      data_inicio: form.data_inicio,
      saldo_inicial: Number(form.saldo_inicial.replace(",", ".")) || 0,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Conta cadastrada");
    setOpen(false);
    setForm({ nome: "", banco: "", data_inicio: new Date().toISOString().slice(0, 10), saldo_inicial: "0" });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta conta e todos os lançamentos?")) return;
    const { error } = await supabase.from("fp_contas" as any).delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Conta excluída");
      load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Contas Correntes</h1>
          <p className="text-sm text-muted-foreground">Cadastre suas contas para começar a registrar lançamentos</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Nova conta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={submit}>
              <DialogHeader>
                <DialogTitle>Nova conta corrente</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-4">
                <div className="space-y-1.5">
                  <Label>Nome da conta *</Label>
                  <Input
                    value={form.nome}
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                    placeholder="Ex.: Conta Nubank"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Banco</Label>
                  <Input
                    value={form.banco}
                    onChange={(e) => setForm({ ...form, banco: e.target.value })}
                    placeholder="Ex.: Nubank"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Data de início *</Label>
                    <Input
                      type="date"
                      value={form.data_inicio}
                      onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Saldo inicial *</Label>
                    <Input
                      inputMode="decimal"
                      value={form.saldo_inicial}
                      onChange={(e) => setForm({ ...form, saldo_inicial: e.target.value })}
                      placeholder="0,00"
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {contas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma conta cadastrada ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {contas.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-base">{c.nome}</CardTitle>
                  <Button size="icon" variant="ghost" onClick={() => remove(c.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {c.banco && <p className="text-xs text-muted-foreground">{c.banco}</p>}
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">Saldo inicial em {new Date(c.data_inicio).toLocaleDateString("pt-BR")}</p>
                <p className="text-lg font-semibold">{fmtBRL(Number(c.saldo_inicial))}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
