import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Conta { id: string; nome: string; }
interface Categoria { id: string; nome: string; tipo: "credito" | "debito"; user_id: string | null; }
interface Subcategoria { id: string; nome: string; categoria_id: string; user_id: string | null; }
interface FormaPagamento { id: string; nome: string; user_id: string | null; }

interface Lancamento {
  id: string;
  data: string;
  tipo: "credito" | "debito";
  valor: number;
  descricao: string | null;
  conta_id: string;
  categoria_id: string | null;
  subcategoria_id: string | null;
  forma_pagamento_id: string | null;
}

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function LancamentosPage() {
  const { user } = useAuth();
  const [contas, setContas] = useState<Conta[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([]);
  const [formas, setFormas] = useState<FormaPagamento[]>([]);
  const [lancs, setLancs] = useState<Lancamento[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    conta_id: "",
    data: new Date().toISOString().slice(0, 10),
    tipo: "debito" as "credito" | "debito",
    valor: "",
    descricao: "",
    categoria_id: "",
    subcategoria_id: "",
    forma_pagamento_id: "",
    nova_categoria: "",
    nova_subcategoria: "",
    nova_forma: "",
  });

  const load = async () => {
    if (!user) return;
    const [c, cat, sub, fp, lc] = await Promise.all([
      supabase.from("fp_contas" as any).select("id,nome").eq("user_id", user.id).order("nome"),
      supabase.from("fp_categorias" as any).select("*").or(`user_id.is.null,user_id.eq.${user.id}`).order("nome"),
      supabase.from("fp_subcategorias" as any).select("*").or(`user_id.is.null,user_id.eq.${user.id}`).order("nome"),
      supabase.from("fp_formas_pagamento" as any).select("*").or(`user_id.is.null,user_id.eq.${user.id}`).order("nome"),
      supabase.from("fp_lancamentos" as any).select("*").eq("user_id", user.id).order("data", { ascending: false }).limit(200),
    ]);
    setContas((c.data as any) ?? []);
    setCategorias((cat.data as any) ?? []);
    setSubcategorias((sub.data as any) ?? []);
    setFormas((fp.data as any) ?? []);
    setLancs((lc.data as any) ?? []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const categoriasFiltradas = useMemo(
    () => categorias.filter((c) => c.tipo === form.tipo),
    [categorias, form.tipo]
  );
  const subFiltradas = useMemo(
    () => subcategorias.filter((s) => s.categoria_id === form.categoria_id),
    [subcategorias, form.categoria_id]
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.conta_id) return toast.error("Selecione uma conta");
    if (!form.valor) return toast.error("Informe o valor");

    setSaving(true);

    let categoria_id: string | null = form.categoria_id || null;
    let subcategoria_id: string | null = form.subcategoria_id || null;
    let forma_pagamento_id: string | null = form.forma_pagamento_id || null;

    // criar nova categoria se solicitado
    if (form.nova_categoria.trim()) {
      const { data, error } = await supabase
        .from("fp_categorias" as any)
        .insert({ user_id: user.id, nome: form.nova_categoria.trim(), tipo: form.tipo })
        .select("id")
        .single();
      if (error) { setSaving(false); return toast.error(error.message); }
      categoria_id = (data as any).id;
    }
    if (form.nova_subcategoria.trim() && categoria_id) {
      const { data, error } = await supabase
        .from("fp_subcategorias" as any)
        .insert({ user_id: user.id, categoria_id, nome: form.nova_subcategoria.trim() })
        .select("id")
        .single();
      if (error) { setSaving(false); return toast.error(error.message); }
      subcategoria_id = (data as any).id;
    }
    if (form.nova_forma.trim()) {
      const { data, error } = await supabase
        .from("fp_formas_pagamento" as any)
        .insert({ user_id: user.id, nome: form.nova_forma.trim(), tipo: "cartao_credito" })
        .select("id")
        .single();
      if (error) { setSaving(false); return toast.error(error.message); }
      forma_pagamento_id = (data as any).id;
    }

    const { error } = await supabase.from("fp_lancamentos" as any).insert({
      user_id: user.id,
      conta_id: form.conta_id,
      data: form.data,
      tipo: form.tipo,
      valor: Number(form.valor.replace(",", ".")) || 0,
      descricao: form.descricao.trim() || null,
      categoria_id,
      subcategoria_id,
      forma_pagamento_id,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Lançamento registrado");
    setOpen(false);
    setForm({
      conta_id: form.conta_id,
      data: new Date().toISOString().slice(0, 10),
      tipo: "debito",
      valor: "",
      descricao: "",
      categoria_id: "",
      subcategoria_id: "",
      forma_pagamento_id: "",
      nova_categoria: "",
      nova_subcategoria: "",
      nova_forma: "",
    });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir lançamento?")) return;
    const { error } = await supabase.from("fp_lancamentos" as any).delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Excluído"); load(); }
  };

  const nomeConta = (id: string) => contas.find((c) => c.id === id)?.nome ?? "-";
  const nomeCat = (id: string | null) => categorias.find((c) => c.id === id)?.nome ?? "-";
  const nomeSub = (id: string | null) => subcategorias.find((s) => s.id === id)?.nome ?? "-";
  const nomeForma = (id: string | null) => formas.find((f) => f.id === id)?.nome ?? "-";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Lançamentos</h1>
          <p className="text-sm text-muted-foreground">Créditos e débitos das suas contas</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button disabled={contas.length === 0}>
              <Plus className="mr-2 h-4 w-4" /> Novo lançamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <form onSubmit={submit}>
              <DialogHeader>
                <DialogTitle>Novo lançamento</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 py-4">
                <div className="space-y-1.5 col-span-2">
                  <Label>Conta *</Label>
                  <Select value={form.conta_id} onValueChange={(v) => setForm({ ...form, conta_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger>
                    <SelectContent>
                      {contas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Data *</Label>
                  <Input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo *</Label>
                  <Select value={form.tipo} onValueChange={(v: "credito" | "debito") => setForm({ ...form, tipo: v, categoria_id: "", subcategoria_id: "" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="credito">Crédito</SelectItem>
                      <SelectItem value="debito">Débito</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Valor *</Label>
                  <Input inputMode="decimal" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="0,00" />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Descrição</Label>
                  <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Opcional" />
                </div>
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <Select value={form.categoria_id} onValueChange={(v) => setForm({ ...form, categoria_id: v, subcategoria_id: "" })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {categoriasFiltradas.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="mt-1"
                    placeholder="Ou nova categoria..."
                    value={form.nova_categoria}
                    onChange={(e) => setForm({ ...form, nova_categoria: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Subcategoria</Label>
                  <Select value={form.subcategoria_id} onValueChange={(v) => setForm({ ...form, subcategoria_id: v })} disabled={!form.categoria_id}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {subFiltradas.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="mt-1"
                    placeholder="Ou nova subcategoria..."
                    value={form.nova_subcategoria}
                    onChange={(e) => setForm({ ...form, nova_subcategoria: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Forma de pagamento</Label>
                  <Select value={form.forma_pagamento_id} onValueChange={(v) => setForm({ ...form, forma_pagamento_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {formas.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    className="mt-1"
                    placeholder="Ou nova forma (ex.: Nubank Crédito)..."
                    value={form.nova_forma}
                    onChange={(e) => setForm({ ...form, nova_forma: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {contas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Cadastre uma conta corrente antes de lançar movimentações.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Subcategoria</TableHead>
                  <TableHead>Forma</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lancs.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Sem lançamentos</TableCell></TableRow>
                ) : lancs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>{new Date(l.data).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{nomeConta(l.conta_id)}</TableCell>
                    <TableCell>{l.descricao ?? "-"}</TableCell>
                    <TableCell>{nomeCat(l.categoria_id)}</TableCell>
                    <TableCell>{nomeSub(l.subcategoria_id)}</TableCell>
                    <TableCell>{nomeForma(l.forma_pagamento_id)}</TableCell>
                    <TableCell className={`text-right font-medium ${l.tipo === "credito" ? "text-primary" : "text-destructive"}`}>
                      {l.tipo === "credito" ? "+" : "-"} {fmtBRL(Number(l.valor))}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => remove(l.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
