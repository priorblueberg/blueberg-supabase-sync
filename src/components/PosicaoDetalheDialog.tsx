import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { fullSyncAfterDelete } from "@/lib/syncEngine";
import { useBoletaModal } from "@/contexts/BoletaModalContext";
import type { CustodiaRowForBoleta } from "@/types/boleta";

interface Movimentacao {
  id: string;
  data: string;
  tipo_movimentacao: string;
  valor: number;
  quantidade: number | null;
  preco_unitario: number | null;
  origem: string;
}

export interface PosicaoDetalheData {
  nome: string;
  custodiante: string;
  valorAtualizado: number;
  dataInicio: string;
  codigoCustodia: number;
  categoriaId: string;
  indexador: string | null;
  taxa: number | null;
  modalidade: string | null;
  pagamento: string | null;
  emissor: string | null;
  vencimento: string | null;
  ganhoFinanceiro?: number;
  rentabilidade?: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  data: PosicaoDetalheData;
  userId: string;
  dataReferenciaISO: string;
  onDataChanged: () => void;
  jurosAniversario?: { data: string; valor: number }[];
  pagamentosJuros?: { data: string; valor: number }[];
  prefill?: CustodiaRowForBoleta;
}

function fmtBrl(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtBrl4(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 4, maximumFractionDigits: 4 });
}
function fmtDate(d: string | null) {
  return d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";
}
function fmtQty(v: number | null) {
  return v != null ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 8 }) : "—";
}
function isMoedasCategoria(nome: string): boolean {
  return nome.toLowerCase().includes("dólar") || nome.toLowerCase().includes("euro") || nome.toLowerCase().includes("dollar");
}

export default function PosicaoDetalheDialog({ open, onClose, data, userId, dataReferenciaISO, onDataChanged, jurosAniversario = [], pagamentosJuros = [], prefill }: Props) {
  const isPoupanca = data.modalidade === "Poupança";
  const { openBoleta } = useBoletaModal();
  const [movs, setMovs] = useState<Movimentacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteId, setDeleteId] = useState<Movimentacao | null>(null);

  useEffect(() => {
    if (open) fetchMovs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dataReferenciaISO]);

  async function fetchMovs() {
    setLoading(true);
    const { data: rows } = await supabase
      .from("movimentacoes")
      .select("id, data, tipo_movimentacao, valor, quantidade, preco_unitario, origem")
      .eq("codigo_custodia", data.codigoCustodia)
      .eq("user_id", userId)
      .lte("data", dataReferenciaISO)
      .order("data", { ascending: true });

    // Deduplicate: remove identical auto rows (same date + type + valor)
    const seen = new Set<string>();
    const deduped: Movimentacao[] = [];
    for (const row of rows || []) {
      if (row.origem === "automatico") {
        const key = `${row.data}|${row.tipo_movimentacao}|${row.valor}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      deduped.push(row);
    }

    // Merge synthetic juros rows (Poupança aniversário)
    const jurosRows: Movimentacao[] = jurosAniversario
      .filter((j) => j.data <= dataReferenciaISO)
      .map((j, idx) => ({
        id: `juros-${j.data}-${idx}`,
        data: j.data,
        tipo_movimentacao: "Rendimentos",
        valor: j.valor,
        quantidade: null,
        preco_unitario: null,
        origem: "automatico",
      }));

    // Merge synthetic pagamento de juros (Renda Fixa)
    const pagJurosRows: Movimentacao[] = pagamentosJuros
      .filter((p) => p.data <= dataReferenciaISO)
      .map((p, idx) => ({
        id: `pagjuros-${p.data}-${idx}`,
        data: p.data,
        tipo_movimentacao: "Pagamento de Juros",
        valor: p.valor,
        quantidade: null,
        preco_unitario: null,
        origem: "automatico",
      }));

    // For Poupança, compute running balance (ascending order, then reverse for display)
    const sortedAsc = [...deduped, ...jurosRows, ...pagJurosRows].sort((a, b) => a.data.localeCompare(b.data));
    if (isPoupanca) {
      let saldo = 0;
      for (const m of sortedAsc) {
        if (m.tipo_movimentacao === "Aplicação Inicial" || m.tipo_movimentacao === "Aplicação" || m.tipo_movimentacao === "Aporte") {
          saldo += m.valor;
        } else if (m.tipo_movimentacao === "Resgate" || m.tipo_movimentacao === "Resgate Total" || m.tipo_movimentacao === "Resgate Parcial") {
          saldo -= m.valor;
        } else {
          saldo += m.valor;
        }
        (m as any)._saldo = saldo;
      }
    }
    const combined = sortedAsc.reverse();
    setMovs(combined);
    setLoading(false);
  }

  async function handleDeleteMov() {
    if (!deleteId) return;
    const mov = deleteId;
    const isAplicacaoInicial = mov.tipo_movimentacao === "Aplicação Inicial";

    if (isAplicacaoInicial) {
      await supabase.from("movimentacoes").delete().eq("codigo_custodia", data.codigoCustodia).eq("user_id", userId);
      await supabase.from("custodia").delete().eq("codigo_custodia", data.codigoCustodia).eq("user_id", userId);
      toast.success("Ativo e movimentações excluídos.");
      await fullSyncAfterDelete(data.codigoCustodia, data.categoriaId, userId, dataReferenciaISO);
      onDataChanged();
      setDeleteId(null);
      onClose();
      return;
    }

    const { error } = await supabase.from("movimentacoes").delete().eq("id", mov.id);
    if (error) {
      toast.error("Erro ao excluir movimentação.");
    } else {
      toast.success("Movimentação excluída.");
      await fullSyncAfterDelete(data.codigoCustodia, data.categoriaId, userId, dataReferenciaISO);
      onDataChanged();
      fetchMovs();
    }
    setDeleteId(null);
  }

  function handleAplicacaoResgate(tipo: "Aplicação" | "Resgate") {
    if (!prefill) return;
    onClose();
    openBoleta({ origin: "posicao", tipo, prefill });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-4xl w-[95vw] h-[85vh] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="pr-8 px-6 pt-6 shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-lg font-bold">{data.nome}</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  {data.custodiante} · Período: {fmtDate(data.dataInicio)} — {fmtDate(dataReferenciaISO)}
                </DialogDescription>
              </div>
              <span className="text-lg font-semibold text-foreground whitespace-nowrap shrink-0">
                {fmtBrl(data.valorAtualizado)}
              </span>
            </div>
          </DialogHeader>

          <Tabs defaultValue="historico" className="mt-2 flex flex-col flex-1 min-h-0 px-6 pb-6">
            <div className="flex items-center justify-between gap-4 shrink-0">
              <TabsList>
                <TabsTrigger value="historico">Histórico</TabsTrigger>
                <TabsTrigger value="dados">Dados</TabsTrigger>
              </TabsList>
              {!isPoupanca && prefill && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleAplicacaoResgate("Aplicação")}>Aplicação</Button>
                  <Button variant="outline" size="sm" onClick={() => handleAplicacaoResgate("Resgate")}>Resgate</Button>
                </div>
              )}
            </div>

            <TabsContent value="historico" className="flex-1 min-h-0 mt-3 overflow-hidden">
              {loading ? (
                <p className="text-sm text-muted-foreground py-4">Carregando...</p>
              ) : movs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Nenhuma movimentação.</p>
              ) : (
                <div className="rounded-md border h-full overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-[100px]">Data</TableHead>
                        <TableHead className="w-[160px]">Tipo</TableHead>
                        <TableHead className="w-[130px]">Valor</TableHead>
                        {!isPoupanca && <TableHead className="w-[100px]">Quantidade</TableHead>}
                        {!isPoupanca && <TableHead className="w-[120px]">Preço Unit.</TableHead>}
                        <TableHead className="w-[80px]">Origem</TableHead>
                        {!isPoupanca && <TableHead className="w-[80px] text-right">Ações</TableHead>}
                        {isPoupanca && <TableHead className="w-[130px] text-right">Saldo</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movs.map((m) => {
                        const isAuto = m.origem === "automatico";
                        const isResgateVenc = m.tipo_movimentacao === "Resgate no Vencimento" || m.tipo_movimentacao === "Resgate Total";
                        const jurosDoDia = isResgateVenc
                          ? pagamentosJuros.filter((p) => p.data === m.data).reduce((s, p) => s + p.valor, 0)
                          : 0;
                        const displayTipo = isResgateVenc ? "Amortização" : m.tipo_movimentacao;
                        const displayValor = isResgateVenc ? Math.max(0, m.valor - jurosDoDia) : m.valor;
                        return (
                          <TableRow key={m.id}>
                            <TableCell className="whitespace-nowrap">{fmtDate(m.data)}</TableCell>
                            <TableCell className="whitespace-nowrap">{displayTipo}</TableCell>
                            <TableCell className="whitespace-nowrap">{fmtBrl(displayValor)}</TableCell>
                            {!isPoupanca && <TableCell className="whitespace-nowrap">{fmtQty(m.quantidade)}</TableCell>}
                            {!isPoupanca && <TableCell className="whitespace-nowrap">{m.preco_unitario != null ? (isMoedasCategoria(data.nome) ? fmtBrl4(m.preco_unitario) : fmtBrl(m.preco_unitario)) : "—"}</TableCell>}
                            <TableCell>
                              {isAuto ? "Auto" : "Manual"}
                            </TableCell>
                            {!isPoupanca && (
                              <TableCell className="text-right">
                                {!isAuto && (
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      variant="ghost" size="icon" className="h-7 w-7"
                                      onClick={() => { onClose(); openBoleta({ origin: "edit", editId: m.id }); }}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                                      onClick={() => setDeleteId(m)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            )}
                            {isPoupanca && (
                              <TableCell className="whitespace-nowrap text-right font-medium">
                                {fmtBrl((m as any)._saldo ?? 0)}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="dados" className="flex-1 min-h-0 mt-3 overflow-auto">
              {isPoupanca ? (
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 py-2 text-sm">
                  <DataField label="Nome do Ativo" value={data.nome} />
                  <DataField label="Instituição" value={data.custodiante} />
                  <DataField label="Ganho Financeiro" value={data.ganhoFinanceiro != null ? fmtBrl(data.ganhoFinanceiro) : "—"} />
                  <DataField label="Rentabilidade" value={data.rentabilidade != null ? `${data.rentabilidade.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%` : "—"} />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 py-2 text-sm">
                  <DataField label="Nome do Ativo" value={data.nome} />
                  <DataField label="Indexador" value={data.indexador ?? "—"} />
                  <DataField label="Taxa" value={data.taxa != null ? `${data.taxa.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%` : "—"} />
                  <DataField label="Modalidade" value={data.modalidade ?? "—"} />
                  <DataField label="Tipo de Pagamento" value={data.pagamento ?? "—"} />
                  <DataField label="Emissor" value={data.emissor ?? "—"} />
                  <DataField label="Custodiante" value={data.custodiante} />
                  <DataField label="Vencimento" value={fmtDate(data.vencimento ?? null)} />
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteId?.tipo_movimentacao === "Aplicação Inicial"
                ? "Ao excluir a Aplicação Inicial, o ativo e todas as movimentações serão removidas permanentemente."
                : "Deseja excluir esta movimentação?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMov}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DataField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}</span>
      <p className="font-medium text-foreground">{value}</p>
    </div>
  );
}
