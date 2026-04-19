import { useState, useEffect } from "react";
import { format, parse, isValid } from "date-fns";
import { PlusCircle, AlertTriangle, HelpCircle, CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { fullSyncAfterMovimentacao } from "@/lib/syncEngine";
import { calcularRendaFixaDiario } from "@/lib/rendaFixaEngine";
import { useDataReferencia } from "@/contexts/DataReferenciaContext";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import SearchableSelect from "@/components/SearchableSelect";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useBoletaModal } from "@/contexts/BoletaModalContext";
import type { CustodiaRowForBoleta } from "@/types/boleta";

interface Categoria { id: string; nome: string; }
interface Produto { id: string; nome: string; }
interface Instituicao { id: string; nome: string; }
interface Emissor { id: string; nome: string; }
interface CustodiaItem {
  id: string;
  nome: string | null;
  codigo_custodia: number;
  data_inicio: string;
  valor_investido: number;
  taxa: number | null;
  indexador: string | null;
  vencimento: string | null;
  modalidade: string | null;
  pagamento: string | null;
  produto_id: string;
  instituicao_id: string | null;
  emissor_id: string | null;
  categoria_id: string;
  preco_unitario: number | null;
  resgate_total: string | null;
}

function applyDateMask(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.slice(0, 2) + "/" + digits.slice(2);
  return digits.slice(0, 2) + "/" + digits.slice(2, 4) + "/" + digits.slice(4);
}
function parseDateInput(masked: string): Date | null {
  if (masked.length !== 10) return null;
  const d = parse(masked, "dd/MM/yyyy", new Date());
  if (!isValid(d)) return null;
  const year = d.getFullYear();
  if (year < 1900 || year > 2100) return null;
  return d;
}
function numberToCurrency(num: number): string {
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const TIPOS_MOVIMENTACAO = ["Aplicação", "Resgate"];
const PAGAMENTO_OPTIONS = ["Mensal","Bimestral","Trimestral","Quadrimestral","Semestral","Anual","No Vencimento"];
const MODALIDADE_OPTIONS = ["Prefixado", "Pós Fixado"];
const INDEXADOR_OPTIONS = ["CDI", "CDI+", "IPCA"];

function formatCurrency(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10);
  return (num / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatCotacao4(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  const num = parseInt(digits, 10);
  return (num / 10000).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}
function formatTaxaInput(value: string): string {
  let cleaned = value.replace(/[^\d,]/g, "");
  const parts = cleaned.split(",");
  if (parts.length > 2) {
    cleaned = parts[0] + "," + parts.slice(1).join("");
    return formatTaxaInput(cleaned);
  }
  if (parts.length === 1) {
    const intDigits = parts[0].replace(/^0+(?=\d)/, "") || "";
    return intDigits;
  }
  const intPart = parts[0].replace(/^0+(?=\d)/, "") || "0";
  const decPart = parts[1].slice(0, 2);
  return intPart + "," + decPart;
}
function parseCurrencyToNumber(value: string): number {
  const cleaned = value.replace(/\./g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}
function sigla(nome: string): string { return nome.replace(/\s*\(.*\)$/, "").trim(); }

function buildNomeAtivo(produtoNome: string, emissorNome: string, modalidade: string, taxa: string, vencimento: string, indexador: string, pagamento?: string): string {
  const prod = sigla(produtoNome);
  const taxaFormatted = taxa ? `${taxa.replace(".", ",")}%` : "";
  const vencFormatted = vencimento ? new Date(vencimento + "T00:00:00").toLocaleDateString("pt-BR") : "";
  const pagSuffix = pagamento && pagamento !== "No Vencimento" ? `[${pagamento}]` : "";
  let base: string;
  if (modalidade === "Prefixado") {
    base = [prod, emissorNome, modalidade, taxaFormatted ? `${taxaFormatted} a.a.` : "", vencFormatted ? `- ${vencFormatted}` : ""].filter(Boolean).join(" ");
  } else if (indexador === "IPCA") {
    base = [prod, emissorNome, "IPCA", taxaFormatted ? `+ ${taxaFormatted} a.a.` : "", vencFormatted ? `- ${vencFormatted}` : ""].filter(Boolean).join(" ");
  } else if (indexador === "CDI") {
    base = [prod, emissorNome, modalidade, taxaFormatted, "do CDI", vencFormatted ? `- ${vencFormatted}` : ""].filter(Boolean).join(" ");
  } else {
    base = [prod, emissorNome, modalidade, indexador, taxaFormatted, vencFormatted ? `- ${vencFormatted}` : ""].filter(Boolean).join(" ");
  }
  return pagSuffix ? `${base} ${pagSuffix}` : base;
}

interface DialogProps {
  open: boolean;
  onClose: () => void;
  origin: "header" | "posicao" | "edit";
  initialTipo?: "Aplicação" | "Resgate";
  prefill?: CustodiaRowForBoleta;
  editId?: string;
}

export default function CadastrarTransacaoDialog({ open, onClose, origin, initialTipo, prefill, editId }: DialogProps) {
  const { user } = useAuth();
  const { dataReferenciaISO, applyDataReferencia } = useDataReferencia();

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [instituicoes, setInstituicoes] = useState<Instituicao[]>([]);
  const [emissores, setEmissores] = useState<Emissor[]>([]);

  const [custodiaItems, setCustodiaItems] = useState<CustodiaItem[]>([]);
  const [selectedCustodiaId, setSelectedCustodiaId] = useState("");
  const [saldoDisponivel, setSaldoDisponivel] = useState<number | null>(null);
  const [calculandoSaldo, setCalculandoSaldo] = useState(false);
  const [resgateDateInput, setResgateDateInput] = useState("");
  const [resgateDateError, setResgateDateError] = useState<string | null>(null);
  const [resgateDate, setResgateDate] = useState<Date | undefined>();
  const [fecharPosicao, setFecharPosicao] = useState(false);
  const [resgateCalendarOpen, setResgateCalendarOpen] = useState(false);

  const [categoriaId, setCategoriaId] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [tipoMovimentacao, setTipoMovimentacao] = useState("");
  const [data, setData] = useState("");
  const [valor, setValor] = useState("");
  const [precoUnitario, setPrecoUnitario] = useState("1.000,00");
  const [instituicaoId, setInstituicaoId] = useState("");
  const [emissorId, setEmissorId] = useState("");
  const [modalidade, setModalidade] = useState("");
  const [indexador, setIndexador] = useState("");
  const [taxa, setTaxa] = useState("");
  const [pagamento, setPagamento] = useState("No Vencimento");
  const [vencimento, setVencimento] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [editLoaded, setEditLoaded] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());
  const [vencimentoRemanejado, setVencimentoRemanejado] = useState(false);
  const [dataNaoUtilError, setDataNaoUtilError] = useState<string | null>(null);
  const [dataAnteriorInicialError, setDataAnteriorInicialError] = useState<string | null>(null);

  const categoriaSelecionada = categorias.find((c) => c.id === categoriaId);
  const produtoSelecionado = produtos.find((p) => p.id === produtoId);
  const isRendaFixa = categoriaSelecionada?.nome === "Renda Fixa";
  const isMoedas = categoriaSelecionada?.nome === "Moedas";
  const isDolar = produtoSelecionado?.nome === "Dólar";
  const isEuro = produtoSelecionado?.nome === "Euro";
  const isMoeda = isDolar || isEuro;
  const isPoupanca = produtoSelecionado?.nome === "Poupança";
  const isPosFixado = modalidade === "Pós Fixado";
  const isEditing = !!editId;
  const isResgate = tipoMovimentacao === "Resgate";
  const isAplicacao = tipoMovimentacao === "Aplicação";
  const selectedCustodia = custodiaItems.find((c) => c.id === selectedCustodiaId);

  // Lock helpers — when origin === 'posicao', title fields are pre-filled and locked
  const isFromPosicao = origin === "posicao";
  const lockTitleFields = isFromPosicao;

  // Moeda state
  const [cotacaoMoeda, setCotacaoMoeda] = useState<number | null>(null);
  const [cotacaoNegociacao, setCotacaoNegociacao] = useState("");
  const [cotacaoLoading, setCotacaoLoading] = useState(false);
  const [quantidadeMoeda, setQuantidadeMoeda] = useState<number | null>(null);
  const [resgateCotacaoRef, setResgateCotacaoRef] = useState<number | null>(null);
  const [resgateCotacaoNeg, setResgateCotacaoNeg] = useState("");
  const [valorEmEspecie, setValorEmEspecie] = useState(false);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setCategoriaId(""); setProdutoId(""); setTipoMovimentacao(""); setData("");
      setValor(""); setPrecoUnitario("1.000,00"); setInstituicaoId(""); setEmissorId("");
      setModalidade(""); setIndexador(""); setTaxa(""); setPagamento("No Vencimento");
      setVencimento(""); setSelectedCustodiaId(""); setSaldoDisponivel(null);
      setResgateDateInput(""); setResgateDate(undefined); setResgateDateError(null);
      setFecharPosicao(false); setResgateCalendarOpen(false);
      setCotacaoNegociacao(""); setCotacaoMoeda(null); setQuantidadeMoeda(null);
      setResgateCotacaoRef(null); setResgateCotacaoNeg(""); setValorEmEspecie(false);
      setEditLoaded(false); setValidationErrors(new Set());
      setVencimentoRemanejado(false); setDataNaoUtilError(null);
      setDataAnteriorInicialError(null);
    }
  }, [open]);

  // Helper: encontra primeiro dia útil >= data dada (consultando calendario_dias_uteis)
  async function findNextDiaUtil(dateISO: string): Promise<string | null> {
    const start = new Date(dateISO + "T00:00:00");
    for (let i = 0; i < 30; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = format(d, "yyyy-MM-dd");
      const { data: row } = await supabase.from("calendario_dias_uteis").select("dia_util").eq("data", iso).maybeSingle();
      if (row?.dia_util) return iso;
    }
    return null;
  }

  async function handleVencimentoBlur() {
    if (!vencimento || isPoupanca || !isRendaFixa || lockTitleFields) return;
    const { data: row } = await supabase.from("calendario_dias_uteis").select("dia_util").eq("data", vencimento).maybeSingle();
    if (row?.dia_util) { setVencimentoRemanejado(false); return; }
    const nextDU = await findNextDiaUtil(vencimento);
    if (nextDU && nextDU !== vencimento) {
      setVencimento(nextDU);
      setVencimentoRemanejado(true);
    }
  }

  async function handleDataTransacaoBlur() {
    setDataNaoUtilError(null);
    setDataAnteriorInicialError(null);
    if (!data) return;
    if (isFromPosicao && prefill?.data_inicio && data < prefill.data_inicio) {
      setDataAnteriorInicialError("Data anterior a Aplicação Inicial");
      return;
    }
    if (isPoupanca || (isMoedas && isMoeda)) return;
    const { data: row } = await supabase.from("calendario_dias_uteis").select("dia_util").eq("data", data).maybeSingle();
    if (!row || !row.dia_util) {
      setDataNaoUtilError("A data selecionada não é um dia útil");
    }
  }

  // Load categorias on mount
  useEffect(() => {
    supabase.from("categorias").select("id, nome").eq("ativa", true).order("nome").then(({ data }) => {
      if (data) {
        const allowed = data.filter((c: Categoria) => ["Renda Fixa", "Moedas"].includes(c.nome));
        setCategorias(allowed);
      }
    });
  }, []);

  // Load produtos when categoria changes
  useEffect(() => {
    if (!categoriaId) { setProdutos([]); return; }
    supabase.from("produtos").select("id, nome").eq("categoria_id", categoriaId).eq("ativo", true).order("nome").then(({ data }) => {
      if (data) {
        setProdutos(data);
        if (data.length === 1 && !editId && !isFromPosicao) setProdutoId(data[0].id);
      }
    });
  }, [categoriaId]);

  // Load instituicoes and emissores
  useEffect(() => {
    supabase.from("instituicoes").select("id, nome").eq("ativa", true).order("nome").then(({ data }) => { if (data) setInstituicoes(data); });
    supabase.from("emissores").select("id, nome").eq("ativo", true).order("nome").then(({ data }) => { if (data) setEmissores(data); });
  }, []);

  // Apply prefill from origin === 'posicao'
  useEffect(() => {
    if (!open || !isFromPosicao || !prefill || categorias.length === 0) return;
    setCategoriaId(prefill.categoria_id);
    setTipoMovimentacao(initialTipo || "Aplicação");
    setProdutoId(prefill.produto_id);
    setInstituicaoId(prefill.instituicao_id || "");
    setEmissorId(prefill.emissor_id || "");
    setModalidade(prefill.modalidade || "");
    setIndexador(prefill.indexador || "");
    setTaxa(prefill.taxa != null ? String(prefill.taxa).replace(".", ",") : "");
    setPagamento(prefill.pagamento || "No Vencimento");
    setVencimento(prefill.vencimento || "");
    if (prefill.preco_unitario != null) {
      setPrecoUnitario(formatCurrency(Math.round(prefill.preco_unitario * 100).toString()));
    }
    // For Resgate, also set the custodia selection so resgate flow works
    if (initialTipo === "Resgate") {
      setSelectedCustodiaId(prefill.id);
    }
  }, [open, isFromPosicao, prefill, initialTipo, categorias]);

  // Load custodia items when Resgate is selected
  useEffect(() => {
    if (!isResgate || !categoriaId || !user) { setCustodiaItems([]); return; }
    supabase.from("custodia")
      .select("id, nome, codigo_custodia, data_inicio, valor_investido, taxa, indexador, vencimento, modalidade, pagamento, produto_id, instituicao_id, emissor_id, categoria_id, preco_unitario, resgate_total")
      .eq("categoria_id", categoriaId).eq("user_id", user.id).order("nome")
      .then(({ data }) => { if (data) setCustodiaItems(data as CustodiaItem[]); });
  }, [isResgate, categoriaId, user]);

  useEffect(() => {
    if (!selectedCustodia) return;
    setProdutoId(selectedCustodia.produto_id);
    setInstituicaoId(selectedCustodia.instituicao_id || "");
    setEmissorId(selectedCustodia.emissor_id || "");
    setModalidade(selectedCustodia.modalidade || "");
    setIndexador(selectedCustodia.indexador || "");
    setTaxa(selectedCustodia.taxa ? String(selectedCustodia.taxa) : "");
    setPagamento(selectedCustodia.pagamento || "No Vencimento");
    setVencimento(selectedCustodia.vencimento || "");
  }, [selectedCustodia]);

  useEffect(() => {
    if (!isResgate || saldoDisponivel == null || saldoDisponivel <= 0) return;
    const valorNum = parseCurrencyToNumber(valor);
    if (valorNum > 0 && Math.abs(valorNum - saldoDisponivel) < 0.01) {
      if (!fecharPosicao) setFecharPosicao(true);
    }
  }, [valor, saldoDisponivel, isResgate]);

  const handleFecharPosicaoChange = (checked: boolean) => {
    setFecharPosicao(checked);
    if (checked && saldoDisponivel != null && saldoDisponivel > 0) {
      setValor(numberToCurrency(saldoDisponivel));
    } else if (!checked) {
      setValor("");
    }
  };

  const clearResgateCalculated = () => {
    setResgateDate(undefined); setSaldoDisponivel(null); setFecharPosicao(false);
    setValor(""); setResgateDateError(null);
  };

  const processResgateDate = async (d: Date) => {
    if (!selectedCustodia || !user) return;
    setResgateDate(d); setSaldoDisponivel(null); setFecharPosicao(false); setValor(""); setResgateDateError(null);
    const dateISO = format(d, "yyyy-MM-dd");
    setData(dateISO);

    const inicioDate = new Date(selectedCustodia.data_inicio + "T00:00:00");
    if (d < inicioDate) { setResgateDateError("A data selecionada não pode ser anterior à aplicação inicial."); return; }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (d > today) { setResgateDateError("A data não pode ser superior à data atual."); return; }
    if (selectedCustodia.vencimento) {
      const vencDate = new Date(selectedCustodia.vencimento + "T00:00:00");
      if (d > vencDate) { setResgateDateError("A data não pode ser posterior ao vencimento do título."); return; }
    }
    if (selectedCustodia.resgate_total) {
      const resgateDate = new Date(selectedCustodia.resgate_total + "T00:00:00");
      if (d >= resgateDate) { setResgateDateError("A data deve ser anterior à data do resgate total."); return; }
    }
    const isPoupancaResgate = selectedCustodia.modalidade === "Poupança";
    const isMoedasResgateCat = categorias.find(c => c.id === selectedCustodia.categoria_id)?.nome === "Moedas";
    if (!isPoupancaResgate && !isMoedasResgateCat) {
      const { data: diaUtil } = await supabase.from("calendario_dias_uteis").select("dia_util").eq("data", dateISO).maybeSingle();
      if (!diaUtil || !diaUtil.dia_util) { setResgateDateError("A data selecionada não é um dia útil."); return; }
    }
    const isMoedasCustodia = categorias.find(c => c.id === selectedCustodia.categoria_id)?.nome === "Moedas";
    if (isMoedasCustodia) {
      setCalculandoSaldo(true);
      try {
        const { data: movs } = await supabase.from("movimentacoes").select("tipo_movimentacao, quantidade").eq("codigo_custodia", selectedCustodia.codigo_custodia).eq("user_id", user.id);
        let qtyMoeda = 0;
        for (const m of movs || []) {
          if (["Aplicação Inicial", "Aplicação"].includes(m.tipo_movimentacao)) qtyMoeda += (m.quantidade || 0);
          else if (["Resgate", "Resgate Total"].includes(m.tipo_movimentacao)) qtyMoeda -= (m.quantidade || 0);
        }
        const resgateProdutoNome = produtos.find(p => p.id === selectedCustodia.produto_id)?.nome || "";
        const cotacaoTable = resgateProdutoNome.toLowerCase().includes("euro") ? "historico_euro" : "historico_dolar";
        const { data: cotRow } = await supabase.from(cotacaoTable).select("cotacao_venda").eq("data", dateISO).maybeSingle();
        const cotRef = cotRow?.cotacao_venda ?? null;
        setResgateCotacaoRef(cotRef);
        if (cotRef) setResgateCotacaoNeg(formatCotacao4(Math.round(cotRef * 10000).toString()));
        else setResgateCotacaoNeg("");
        if (cotRef && qtyMoeda > 0) setSaldoDisponivel(qtyMoeda * cotRef);
        else setSaldoDisponivel(null);
      } catch { setSaldoDisponivel(null); }
      finally { setCalculandoSaldo(false); }
      return;
    }
    const isRendaFixaEngine = (selectedCustodia.modalidade === "Prefixado" || selectedCustodia.modalidade === "Pos Fixado" || selectedCustodia.modalidade === "Pós Fixado" || selectedCustodia.modalidade === "Mista") && selectedCustodia.taxa && selectedCustodia.preco_unitario;
    if (isRendaFixaEngine) {
      setCalculandoSaldo(true);
      try {
        let engineModalidade = selectedCustodia.modalidade!;
        let engineIndexador = selectedCustodia.indexador ?? null;
        if ((engineModalidade === "Pós Fixado" || engineModalidade === "Pos Fixado") && engineIndexador === "CDI+") {
          engineModalidade = "Mista"; engineIndexador = "CDI";
        }
        const isPosFixadoCDI = ((engineModalidade === "Pos Fixado" || engineModalidade === "Pós Fixado") && engineIndexador === "CDI") || (engineModalidade === "Mista" && engineIndexador === "CDI");
        const calQuery = supabase.from("calendario_dias_uteis").select("data, dia_util").gte("data", selectedCustodia.data_inicio).lte("data", dateISO).order("data");
        const movQuery = supabase.from("movimentacoes").select("data, tipo_movimentacao, valor").eq("codigo_custodia", selectedCustodia.codigo_custodia).eq("user_id", user.id).order("data");
        const custQuery = supabase.from("custodia").select("resgate_total").eq("codigo_custodia", selectedCustodia.codigo_custodia).eq("user_id", user.id).maybeSingle();
        const cdiQuery = isPosFixadoCDI ? supabase.from("historico_cdi").select("data, taxa_anual").gte("data", selectedCustodia.data_inicio).lte("data", dateISO).order("data") : null;
        const [calRes, movRes, custRes, cdiRes] = await Promise.all([calQuery, movQuery, custQuery, ...(cdiQuery ? [cdiQuery] : [])]);
        const calendario = calRes.data || [];
        const movimentacoes = (movRes.data || []).map((m: any) => ({ data: m.data, tipo_movimentacao: m.tipo_movimentacao, valor: Number(m.valor) }));
        const cdiRecords = isPosFixadoCDI && cdiRes ? ((cdiRes as any).data || []).map((r: any) => ({ data: r.data, taxa_anual: Number(r.taxa_anual) })) : undefined;
        const rows = calcularRendaFixaDiario({
          dataInicio: selectedCustodia.data_inicio, dataCalculo: dateISO, taxa: selectedCustodia.taxa!,
          modalidade: engineModalidade, puInicial: selectedCustodia.preco_unitario!, calendario, movimentacoes,
          dataResgateTotal: custRes.data?.resgate_total ?? null, pagamento: selectedCustodia.pagamento,
          vencimento: selectedCustodia.vencimento, indexador: engineIndexador, cdiRecords,
        });
        let targetRow = rows.find((r) => r.data === dateISO);
        if (!targetRow && rows.length > 0) {
          for (let i = rows.length - 1; i >= 0; i--) { if (rows[i].data <= dateISO) { targetRow = rows[i]; break; } }
        }
        if (targetRow) setSaldoDisponivel(targetRow.liquido2);
      } catch { setSaldoDisponivel(null); }
      finally { setCalculandoSaldo(false); }
    } else if (selectedCustodia.modalidade === "Poupança") {
      setSaldoDisponivel(selectedCustodia.valor_investido);
    } else { setSaldoDisponivel(null); }
  };

  const handleResgateDateInputChange = (rawValue: string) => {
    const masked = applyDateMask(rawValue);
    setResgateDateInput(masked);
    clearResgateCalculated();
    setData("");
    const parsed = parseDateInput(masked);
    if (parsed) processResgateDate(parsed);
  };
  const handleResgateCalendarSelect = (d: Date | undefined) => {
    setResgateCalendarOpen(false);
    if (!d) { setResgateDateInput(""); clearResgateCalculated(); setData(""); return; }
    setResgateDateInput(format(d, "dd/MM/yyyy"));
    processResgateDate(d);
  };

  // Edit mode loader
  useEffect(() => {
    if (!editId || editLoaded || categorias.length === 0 || !open) return;
    (async () => {
      const { data: mov } = await supabase.from("movimentacoes").select("*").eq("id", editId).single();
      if (!mov) { toast.error("Movimentação não encontrada."); onClose(); return; }
      setCategoriaId(mov.categoria_id);
      setTipoMovimentacao(mov.tipo_movimentacao);
      setProdutoId(mov.produto_id);
      setData(mov.data);
      setValor(mov.valor ? formatCurrency(Math.round(mov.valor * 100).toString()) : "");
      const editIsMoedas = categorias.find(c => c.id === mov.categoria_id)?.nome === "Moedas";
      setPrecoUnitario(mov.preco_unitario
        ? (editIsMoedas ? formatCotacao4(Math.round(mov.preco_unitario * 10000).toString()) : formatCurrency(Math.round(mov.preco_unitario * 100).toString()))
        : "1.000,00");
      setInstituicaoId(mov.instituicao_id || "");
      setEmissorId(mov.emissor_id || "");
      setModalidade(mov.modalidade || "");
      setIndexador(mov.indexador || "");
      setTaxa(mov.taxa ? String(mov.taxa) : "");
      setPagamento(mov.pagamento || "No Vencimento");
      setVencimento(mov.vencimento || "");
      setEditLoaded(true);
    })();
  }, [editId, editLoaded, categorias, open]);

  const showTipoMovimentacao = !!categoriaId && (isRendaFixa || isMoedas);
  const showAplicacaoFields = showTipoMovimentacao && !!produtoId && (isAplicacao || (isEditing && !!tipoMovimentacao && !isResgate));
  const showResgateFields = showTipoMovimentacao && isResgate && !isEditing;
  const showPoupancaFields = isPoupanca && isAplicacao;
  const showDolarFields = isMoedas && isAplicacao;

  useEffect(() => {
    if (!isMoedas || !isMoeda || !data) {
      setCotacaoMoeda(null); setCotacaoNegociacao(""); setQuantidadeMoeda(null); return;
    }
    setCotacaoLoading(true);
    const tableName = isEuro ? "historico_euro" : "historico_dolar";
    supabase.from(tableName).select("cotacao_venda").eq("data", data).maybeSingle().then(({ data: row }) => {
      const cot = row?.cotacao_venda ?? null;
      setCotacaoMoeda(cot); setCotacaoLoading(false);
      if (cot) {
        setCotacaoNegociacao(formatCotacao4(Math.round(cot * 10000).toString()));
        if (valor) {
          const valorNum = parseCurrencyToNumber(valor);
          if (valorNum > 0) setQuantidadeMoeda(valorNum / cot); else setQuantidadeMoeda(null);
        } else setQuantidadeMoeda(null);
      } else { setCotacaoNegociacao(""); setQuantidadeMoeda(null); }
    });
  }, [data, isMoedas, isMoeda, produtoId]);

  useEffect(() => {
    if (!isMoedas || !isMoeda) { setQuantidadeMoeda(null); return; }
    const cotNeg = parseCurrencyToNumber(cotacaoNegociacao);
    if (cotNeg <= 0) { setQuantidadeMoeda(null); return; }
    const valorNum = parseCurrencyToNumber(valor);
    if (valorNum > 0) setQuantidadeMoeda(valorNum / cotNeg); else setQuantidadeMoeda(null);
  }, [valor, cotacaoNegociacao, isMoedas, isMoeda]);

  const handleSubmit = async () => {
    if (!user) { toast.error("Usuário não autenticado. Faça login novamente."); return; }

    if (isResgate && selectedCustodia) {
      const errors = new Set<string>();
      if (!resgateDate || !data) errors.add("data");
      if (!valor || parseCurrencyToNumber(valor) <= 0) errors.add("valor");
      if (errors.size > 0) { setValidationErrors(errors); toast.error("Preencha todos os campos obrigatórios."); return; }
      if (resgateDateError) { toast.error(resgateDateError); return; }
      setValidationErrors(new Set());
      const valorNum = parseCurrencyToNumber(valor);
      if (saldoDisponivel !== null && valorNum > saldoDisponivel) { toast.error("O valor do resgate excede o saldo disponível."); return; }
      setSubmitting(true);
      try {
        const tipoMovimentacaoFinal = fecharPosicao ? "Resgate Total" : "Resgate";
        const fmtBR = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const isMoedasResgate = categoriaSelecionada?.nome === "Moedas";
        let resgateQty: number | null = null;
        let resgatePU: number | null = null;
        if (isMoedasResgate) {
          const cotNeg = parseCurrencyToNumber(resgateCotacaoNeg);
          if (cotNeg > 0) { resgatePU = cotNeg; resgateQty = valorNum / cotNeg; }
        }
        const { error } = await supabase.from("movimentacoes").insert({
          categoria_id: selectedCustodia.categoria_id, tipo_movimentacao: tipoMovimentacaoFinal,
          data, produto_id: selectedCustodia.produto_id, valor: valorNum,
          preco_unitario: isMoedasResgate ? resgatePU : null,
          instituicao_id: selectedCustodia.instituicao_id, emissor_id: selectedCustodia.emissor_id,
          modalidade: selectedCustodia.modalidade, taxa: selectedCustodia.taxa, pagamento: selectedCustodia.pagamento,
          vencimento: selectedCustodia.vencimento, nome_ativo: selectedCustodia.nome,
          codigo_custodia: selectedCustodia.codigo_custodia, indexador: selectedCustodia.indexador,
          quantidade: isMoedasResgate ? resgateQty : null, valor_extrato: `R$ ${fmtBR(valorNum)}`,
          user_id: user.id, origem: "manual",
        });
        if (error) throw error;
        const { data: inserted } = await supabase.from("movimentacoes").select("id").eq("codigo_custodia", selectedCustodia.codigo_custodia).eq("user_id", user.id).eq("tipo_movimentacao", tipoMovimentacaoFinal).order("created_at", { ascending: false }).limit(1);
        const insertedId = inserted?.[0]?.id || null;
        await fullSyncAfterMovimentacao(insertedId, selectedCustodia.categoria_id, user.id, dataReferenciaISO);
        applyDataReferencia();
        toast.success("Resgate cadastrado com sucesso!");
        onClose();
      } catch (err: any) {
        toast.error("Erro ao cadastrar resgate."); console.error(err);
      } finally { setSubmitting(false); }
      return;
    }

    let requiredFields: Record<string, string>;
    if (isMoedas && isMoeda) {
      const cotNeg = parseCurrencyToNumber(cotacaoNegociacao);
      const moedaRequired: Record<string, string> = { categoriaId, tipoMovimentacao, produtoId, valor, data, cotacaoNegociacao };
      if (!valorEmEspecie) moedaRequired.instituicaoId = instituicaoId;
      requiredFields = moedaRequired;
      if (cotNeg <= 0) { toast.error("Informe a cotação da negociação."); return; }
    } else if (isPoupanca) {
      requiredFields = { categoriaId, tipoMovimentacao, produtoId, valor, data, instituicaoId };
    } else {
      requiredFields = { categoriaId, tipoMovimentacao, produtoId, valor, data, precoUnitario, instituicaoId, emissorId, modalidade, taxa, pagamento, vencimento };
      if (isPosFixado) requiredFields.indexador = indexador;
    }
    const emptyFields = Object.entries(requiredFields).filter(([, v]) => !v).map(([k]) => k);
    if (emptyFields.length > 0) { setValidationErrors(new Set(emptyFields)); toast.error("Preencha todos os campos obrigatórios."); return; }
    setValidationErrors(new Set());

    if (!isPoupanca && !(isMoedas && isMoeda)) {
      const { data: diaUtil } = await supabase.from("calendario_dias_uteis").select("dia_util").eq("data", data).single();
      if (!diaUtil) { toast.error("A data informada não foi encontrada no calendário. Verifique se é um dia útil válido."); return; }
      if (!diaUtil.dia_util) { setDataNaoUtilError("A data selecionada não é um dia útil"); toast.error("A Data de Transação deve ser um dia útil."); return; }
    }

    setSubmitting(true);
    try {
      const produtoNome = produtos.find((p) => p.id === produtoId)?.nome || "";
      const emissorNome = emissores.find((e) => e.id === emissorId)?.nome || "";
      const instituicaoNome = instituicoes.find((i) => i.id === instituicaoId)?.nome || "";
      let nomeAtivo: string | null;
      if (isMoedas && isMoeda) {
        const instLabel = valorEmEspecie ? "Em Espécie" : instituicaoNome;
        nomeAtivo = `${produtoNome} ${instLabel}`.trim();
      } else if (isPoupanca) {
        nomeAtivo = `Poupança ${instituicaoNome}`.trim();
      } else if (isRendaFixa) {
        nomeAtivo = buildNomeAtivo(produtoNome, emissorNome, modalidade, taxa, vencimento, indexador, pagamento);
      } else { nomeAtivo = null; }

      const valorNum = parseCurrencyToNumber(valor);
      let puNum: number; let taxaNum: number; let quantidade: number | null;
      if (isMoedas && isMoeda) { puNum = parseCurrencyToNumber(cotacaoNegociacao); taxaNum = 0; quantidade = quantidadeMoeda; }
      else if (isPoupanca) { puNum = 0; taxaNum = 0; quantidade = null; }
      else { puNum = parseCurrencyToNumber(precoUnitario); taxaNum = parseFloat(taxa.replace(",", ".") || "0"); quantidade = puNum > 0 ? valorNum / puNum : null; }

      let modalidadeToSave = isPoupanca ? "Poupança" : (isMoedas ? null : modalidade);
      let indexadorToSave = isPosFixado ? indexador : null;
      if (modalidade === "Pós Fixado" && indexador === "CDI+") { modalidadeToSave = "Mista"; indexadorToSave = "CDI"; }

      const fmtBR = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const valorExtrato = quantidade != null
        ? `R$ ${fmtBR(valorNum)} (R$ ${fmtBR(puNum)} x ${fmtBR(quantidade)})`
        : `R$ ${fmtBR(valorNum)}`;

      if (isEditing) {
        const { error } = await supabase.from("movimentacoes").update({
          data, valor: valorNum, preco_unitario: puNum, instituicao_id: instituicaoId,
          emissor_id: emissorId, modalidade: modalidadeToSave, taxa: taxaNum, pagamento, vencimento,
          nome_ativo: nomeAtivo, indexador: indexadorToSave, quantidade, valor_extrato: valorExtrato,
        }).eq("id", editId!);
        if (error) throw error;
        await fullSyncAfterMovimentacao(editId!, categoriaId, user!.id, dataReferenciaISO);
        applyDataReferencia();
        toast.success("Transação atualizada com sucesso!");
        onClose();
      } else {
        let codigoCustodia: number; let tipoFinal = tipoMovimentacao;
        if (nomeAtivo) {
          const { data: existing } = await supabase.from("movimentacoes").select("codigo_custodia").eq("nome_ativo", nomeAtivo).not("codigo_custodia", "is", null).limit(1);
          if (existing && existing.length > 0) { codigoCustodia = existing[0].codigo_custodia!; }
          else {
            const { data: maxRow } = await supabase.from("movimentacoes").select("codigo_custodia").not("codigo_custodia", "is", null).order("codigo_custodia", { ascending: false }).limit(1);
            const maxCodigo = maxRow && maxRow.length > 0 ? (maxRow[0].codigo_custodia ?? 99) : 99;
            codigoCustodia = maxCodigo + 1; tipoFinal = "Aplicação Inicial";
          }
        } else { codigoCustodia = 0; }

        const noFields = isPoupanca || (isMoedas && isMoeda);
        const movId = crypto.randomUUID();
        const { error } = await supabase.from("movimentacoes").insert({
          id: movId, categoria_id: categoriaId, tipo_movimentacao: tipoFinal, data, produto_id: produtoId,
          valor: valorNum, preco_unitario: noFields ? (isMoedas ? puNum : null) : puNum,
          instituicao_id: (isMoedas && valorEmEspecie) ? null : instituicaoId,
          emissor_id: isPoupanca ? (() => {
            const instNome = instituicoes.find((i) => i.id === instituicaoId)?.nome || "";
            const matched = emissores.find((e) => e.nome === instNome);
            return matched?.id || null;
          })() : (noFields ? null : emissorId || null),
          modalidade: modalidadeToSave, taxa: noFields ? null : taxaNum,
          pagamento: isPoupanca ? "Mensal" : (isMoedas ? null : pagamento),
          vencimento: noFields ? null : vencimento || null, nome_ativo: nomeAtivo,
          codigo_custodia: nomeAtivo ? codigoCustodia : null,
          indexador: noFields ? null : indexadorToSave, quantidade, valor_extrato: valorExtrato,
          user_id: user?.id, origem: "manual",
        });
        if (error) throw error;
        await fullSyncAfterMovimentacao(movId, categoriaId, user!.id, dataReferenciaISO);
        applyDataReferencia();
        toast.success("Transação cadastrada com sucesso!");
        onClose();
      }
    } catch (err: any) {
      const msg = err?.message || (isEditing ? "Erro ao atualizar transação." : "Erro ao cadastrar transação.");
      toast.error(msg); console.error(err);
    } finally { setSubmitting(false); }
  };

  const getInstituicaoNome = (id: string) => instituicoes.find((i) => i.id === id)?.nome || "—";
  const getEmissorNome = (id: string) => emissores.find((e) => e.id === id)?.nome || "—";
  const fmtBrlDisplay = (v: number | null) => v != null ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
  const valorResgateSuperaSaldo = isResgate && saldoDisponivel !== null && parseCurrencyToNumber(valor) > saldoDisponivel && valor !== "";

  // Filter tipo options based on origin
  const allowedTipos = origin === "header"
    ? TIPOS_MOVIMENTACAO.filter(t => t === "Aplicação")
    : TIPOS_MOVIMENTACAO;

  const titleText = isEditing ? "Editar Transação" : "Cadastrar Transação";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{titleText}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {isEditing ? "Altere os dados da movimentação" : "Os campos com * são de preenchimento obrigatório"}
          </p>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Step 1 */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Categoria do Produto" required>
              <NativeSelect
                value={categoriaId}
                onChange={(v) => {
                  if (isEditing || lockTitleFields) return;
                  setCategoriaId(v); setTipoMovimentacao(""); setProdutoId(""); setSelectedCustodiaId("");
                }}
                placeholder="Selecione uma categoria"
                disabled={isEditing || lockTitleFields}
                options={categorias.map((c) => ({ value: c.id, label: c.nome }))}
              />
            </Field>

            {showTipoMovimentacao && (
              <Field label="Tipo de Movimentação" required>
                <NativeSelect
                  value={tipoMovimentacao}
                  onChange={(v) => {
                    setTipoMovimentacao(v);
                    if (!isPoupanca && !isMoedas) setProdutoId("");
                    setSelectedCustodiaId(""); setValor(""); setSaldoDisponivel(null);
                    if (v === "Resgate") setData("");
                  }}
                  placeholder="Selecione o tipo de movimentação"
                  disabled={isEditing || lockTitleFields}
                  options={TIPOS_MOVIMENTACAO.map((t) => ({
                    value: t, label: t,
                    disabled: !allowedTipos.includes(t),
                  }))}
                />
              </Field>
            )}
          </div>

          {/* Aplicação Flow (Renda Fixa) */}
          {(isAplicacao || (isEditing && !!tipoMovimentacao && !isResgate)) && isRendaFixa && (
            <>
              <Field label="Produto" required>
                <NativeSelect
                  value={produtoId}
                  onChange={(v) => { setProdutoId(v); setValidationErrors((prev) => { const n = new Set(prev); n.delete("produtoId"); return n; }); }}
                  placeholder="Selecione"
                  disabled={isEditing || lockTitleFields}
                  options={produtos.map((p) => ({ value: p.id, label: p.nome }))}
                />
              </Field>

              {isPoupanca && showPoupancaFields && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Data de Transação" required>
                      <input type="date" value={data}
                        onChange={(e) => { setData(e.target.value); setValidationErrors((prev) => { const n = new Set(prev); n.delete("data"); return n; }); }}
                        className={`input-field ${validationErrors.has("data") ? "border-destructive ring-1 ring-destructive" : ""}`} />
                    </Field>
                    <Field label="Valor da Aplicação" required>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                        <input type="text" value={valor}
                          onChange={(e) => { setValor(formatCurrency(e.target.value)); setValidationErrors((prev) => { const n = new Set(prev); n.delete("valor"); return n; }); }}
                          placeholder="0,00"
                          className={`input-field pl-9 ${validationErrors.has("valor") ? "border-destructive ring-1 ring-destructive" : ""}`} />
                      </div>
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Banco" required>
                      <SearchableSelect value={instituicaoId}
                        onChange={(v) => { setInstituicaoId(v); setValidationErrors((prev) => { const n = new Set(prev); n.delete("instituicaoId"); return n; }); }}
                        placeholder="Pesquisar banco..." hasError={validationErrors.has("instituicaoId")} disabled={lockTitleFields}
                        options={instituicoes.map((i) => ({ value: i.id, label: i.nome }))} />
                    </Field>
                  </div>
                  <ActionButtons onCancel={onClose} onSubmit={handleSubmit} submitting={submitting} isEditing={isEditing} />
                </>
              )}

              {!isPoupanca && showAplicacaoFields && (
                <>
                  <div className="grid grid-cols-4 gap-4">
                    <Field label="Data de Transação" required>
                      <input type="date" value={data}
                        min={isFromPosicao ? prefill?.data_inicio || undefined : undefined}
                        onChange={(e) => { setData(e.target.value); setDataNaoUtilError(null); setDataAnteriorInicialError(null); setValidationErrors((prev) => { const n = new Set(prev); n.delete("data"); return n; }); }}
                        onBlur={handleDataTransacaoBlur}
                        className={`input-field ${dataNaoUtilError || dataAnteriorInicialError || validationErrors.has("data") ? "border-destructive ring-1 ring-destructive" : ""}`} />
                      {dataAnteriorInicialError && <p className="text-xs text-destructive mt-1">{dataAnteriorInicialError}</p>}
                      {dataNaoUtilError && <p className="text-xs text-destructive mt-1">{dataNaoUtilError}</p>}
                    </Field>
                    <Field label="Valor Inicial" required>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                        <input type="text" value={valor}
                          onChange={(e) => { setValor(formatCurrency(e.target.value)); setValidationErrors((prev) => { const n = new Set(prev); n.delete("valor"); return n; }); }}
                          placeholder="0,00"
                          className={`input-field pl-9 ${validationErrors.has("valor") ? "border-destructive ring-1 ring-destructive" : ""}`} />
                      </div>
                    </Field>
                    <Field label="Preço de Emissão" required>
                      <TooltipProvider>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                          <input type="text" value={precoUnitario} disabled={lockTitleFields}
                            onChange={(e) => { setPrecoUnitario(formatCurrency(e.target.value)); setValidationErrors((prev) => { const n = new Set(prev); n.delete("precoUnitario"); return n; }); }}
                            placeholder="1.000,00"
                            className={`input-field pl-9 pr-8 ${lockTitleFields ? "opacity-60" : ""} ${validationErrors.has("precoUnitario") ? "border-destructive ring-1 ring-destructive" : ""}`} />
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="absolute right-2 top-1/2 -translate-y-1/2 cursor-help text-muted-foreground">
                                <HelpCircle className="h-3.5 w-3.5" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[220px] text-xs">
                              Caso não saiba, deixe o valor de R$ 1.000,00 (Padrão)
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TooltipProvider>
                    </Field>
                    <Field label="Vencimento" required>
                      <input type="date" value={vencimento} min={data || undefined} disabled={lockTitleFields}
                        onChange={(e) => { setVencimento(e.target.value); setVencimentoRemanejado(false); setValidationErrors((prev) => { const n = new Set(prev); n.delete("vencimento"); return n; }); }}
                        onBlur={handleVencimentoBlur}
                        className={`input-field ${lockTitleFields ? "opacity-60" : ""} ${validationErrors.has("vencimento") ? "border-destructive ring-1 ring-destructive" : ""}`} />
                      {vencimentoRemanejado && <p className="text-xs text-amber-600 mt-1">Data de Vencimento remanejada para o primeiro dia útil após data digitada</p>}
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Corretora" required>
                      <SearchableSelect value={instituicaoId} disabled={lockTitleFields}
                        onChange={(v) => { setInstituicaoId(v); setValidationErrors((prev) => { const n = new Set(prev); n.delete("instituicaoId"); return n; }); }}
                        placeholder="Pesquisar corretora..." hasError={validationErrors.has("instituicaoId")}
                        options={instituicoes.map((i) => ({ value: i.id, label: i.nome }))} />
                    </Field>
                    <Field label="Emissor" required>
                      <SearchableSelect value={emissorId} disabled={lockTitleFields}
                        onChange={(v) => { setEmissorId(v); setValidationErrors((prev) => { const n = new Set(prev); n.delete("emissorId"); return n; }); }}
                        placeholder="Pesquisar emissor..." hasError={validationErrors.has("emissorId")}
                        options={emissores.map((e) => ({ value: e.id, label: e.nome }))} />
                    </Field>
                  </div>

                  <div className={`grid gap-4 ${isPosFixado ? "grid-cols-4" : "grid-cols-3"}`}>
                    <Field label="Modalidade" required>
                      <NativeSelect value={modalidade} disabled={lockTitleFields}
                        onChange={(v) => { setModalidade(v); if (v !== "Pós Fixado") setIndexador(""); setValidationErrors((prev) => { const n = new Set(prev); n.delete("modalidade"); return n; }); }}
                        placeholder="Selecione" options={MODALIDADE_OPTIONS.map((m) => ({ value: m, label: m }))}
                        hasError={validationErrors.has("modalidade")} />
                    </Field>
                    {isPosFixado && (
                      <Field label="Indexador" required>
                        <NativeSelect value={indexador} disabled={lockTitleFields}
                          onChange={(v) => { setIndexador(v); setValidationErrors((prev) => { const n = new Set(prev); n.delete("indexador"); return n; }); }}
                          placeholder="Selecione" options={INDEXADOR_OPTIONS.map((idx) => ({ value: idx, label: idx }))}
                          hasError={validationErrors.has("indexador")} />
                      </Field>
                    )}
                    <Field label="Taxa" required>
                      <div className="relative">
                        <input type="text" value={taxa} disabled={lockTitleFields}
                          onChange={(e) => { setTaxa(formatTaxaInput(e.target.value)); setValidationErrors((prev) => { const n = new Set(prev); n.delete("taxa"); return n; }); }}
                          onBlur={() => { if (taxa) { const cleaned = taxa.replace(",", "."); const num = parseFloat(cleaned); if (!isNaN(num)) setTaxa(num.toFixed(2).replace(".", ",")); } }}
                          placeholder="0,00"
                          className={`input-field pr-7 ${lockTitleFields ? "opacity-60" : ""} ${validationErrors.has("taxa") ? "border-destructive ring-1 ring-destructive" : ""}`} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                      </div>
                    </Field>
                    <Field label="Pagamento de Juros" required>
                      <NativeSelect value={pagamento} disabled={lockTitleFields}
                        onChange={(v) => { setPagamento(v); setValidationErrors((prev) => { const n = new Set(prev); n.delete("pagamento"); return n; }); }}
                        placeholder="Selecione" options={PAGAMENTO_OPTIONS.map((p) => ({ value: p, label: p }))}
                        hasError={validationErrors.has("pagamento")} />
                    </Field>
                  </div>
                  <ActionButtons onCancel={onClose} onSubmit={handleSubmit} submitting={submitting} isEditing={isEditing} />
                </>
              )}
            </>
          )}

          {/* Dólar/Euro Aplicação Flow */}
          {showDolarFields && (
            <>
              <Field label="Produto" required>
                <NativeSelect value={produtoId} onChange={setProdutoId} placeholder="Selecione"
                  disabled={isEditing || lockTitleFields}
                  options={produtos.map((p) => ({ value: p.id, label: p.nome }))} />
              </Field>
              {!!produtoId && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Data de Transação" required>
                      <input type="date" value={data}
                        onChange={(e) => { setData(e.target.value); setValidationErrors((prev) => { const n = new Set(prev); n.delete("data"); return n; }); }}
                        className={`input-field ${validationErrors.has("data") ? "border-destructive ring-1 ring-destructive" : ""}`} />
                    </Field>
                    <Field label="Valor Investido (R$)" required>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                        <input type="text" value={valor}
                          onChange={(e) => { setValor(formatCurrency(e.target.value)); setValidationErrors((prev) => { const n = new Set(prev); n.delete("valor"); return n; }); }}
                          placeholder="0,00"
                          className={`input-field pl-9 ${validationErrors.has("valor") ? "border-destructive ring-1 ring-destructive" : ""}`} />
                      </div>
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label={`Cotação da Negociação (R$/${isEuro ? "EUR" : "USD"})`} required>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                        <input type="text" value={cotacaoLoading ? "Buscando..." : cotacaoNegociacao}
                          onChange={(e) => { setCotacaoNegociacao(formatCotacao4(e.target.value)); setValidationErrors((prev) => { const n = new Set(prev); n.delete("cotacaoNegociacao"); return n; }); }}
                          disabled={cotacaoLoading} placeholder="0,0000"
                          className={`input-field pl-9 ${validationErrors.has("cotacaoNegociacao") ? "border-destructive ring-1 ring-destructive" : ""}`} />
                      </div>
                      {cotacaoMoeda != null && (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Cotação PTAX de referência: R$ {cotacaoMoeda.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                        </p>
                      )}
                      {!cotacaoLoading && data && cotacaoMoeda == null && (
                        <p className="text-[11px] text-amber-500 mt-1">PTAX não encontrada para esta data. Informe a cotação manualmente.</p>
                      )}
                    </Field>
                    <Field label={`Valor em ${isEuro ? "Euro" : "Dólar"}`}>
                      <input type="text"
                        value={quantidadeMoeda != null ? quantidadeMoeda.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}
                        disabled placeholder="Calculado automaticamente" className="input-field opacity-60" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Instituição" required={!valorEmEspecie}>
                      <SearchableSelect value={valorEmEspecie ? "" : instituicaoId}
                        onChange={(v) => { setInstituicaoId(v); setValidationErrors((prev) => { const n = new Set(prev); n.delete("instituicaoId"); return n; }); }}
                        placeholder="Pesquisar instituição..." hasError={!valorEmEspecie && validationErrors.has("instituicaoId")}
                        disabled={valorEmEspecie || lockTitleFields}
                        options={instituicoes.map((i) => ({ value: i.id, label: i.nome }))} />
                    </Field>
                    <div className="flex items-end pb-1">
                      <div className="flex items-center gap-2">
                        <Checkbox id="valor-em-especie" checked={valorEmEspecie} disabled={!!instituicaoId || lockTitleFields}
                          onCheckedChange={(checked) => { setValorEmEspecie(!!checked); if (checked) setInstituicaoId(""); }} />
                        <label htmlFor="valor-em-especie" className="text-sm font-medium text-foreground cursor-pointer">Em Espécie</label>
                      </div>
                    </div>
                  </div>
                  <ActionButtons onCancel={onClose} onSubmit={handleSubmit} submitting={submitting} isEditing={isEditing} disabled={!cotacaoNegociacao} />
                </>
              )}
            </>
          )}

          {/* Resgate Flow */}
          {showResgateFields && (
            <>
              {!isFromPosicao && (
                <Field label="Nome do Título" required>
                  <NativeSelect value={selectedCustodiaId}
                    onChange={(v) => { setSelectedCustodiaId(v); setValor(""); setData(""); setSaldoDisponivel(null); setResgateDateInput(""); setResgateDate(undefined); setResgateDateError(null); setFecharPosicao(false); }}
                    placeholder="Selecione o título em custódia"
                    options={custodiaItems.map((c) => ({ value: c.id, label: c.nome || `Custódia #${c.codigo_custodia}` }))} />
                </Field>
              )}
              {isFromPosicao && prefill && (
                <Field label="Nome do Título">
                  <input type="text" value={prefill.nome || `Custódia #${prefill.codigo_custodia}`} disabled className="input-field opacity-60" />
                </Field>
              )}

              {selectedCustodia && (
                <>
                  <Field label="Data de Transação" required>
                    <div className="flex gap-2">
                      <Input placeholder="dd/mm/aaaa" value={resgateDateInput}
                        className={cn("flex-1 max-w-[220px]", resgateDateError || validationErrors.has("data") ? "border-destructive ring-1 ring-destructive" : "")}
                        onChange={(e) => { handleResgateDateInputChange(e.target.value); setValidationErrors((prev) => { const n = new Set(prev); n.delete("data"); return n; }); }} />
                      <Popover open={resgateCalendarOpen} onOpenChange={setResgateCalendarOpen}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="icon" className="shrink-0"><CalendarIcon className="h-4 w-4" /></Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar mode="single" selected={resgateDate} onSelect={handleResgateCalendarSelect} initialFocus className="p-3 pointer-events-auto" />
                        </PopoverContent>
                      </Popover>
                    </div>
                    {resgateDateError && <p className="text-xs font-medium text-destructive mt-1">{resgateDateError}</p>}
                  </Field>

                  {resgateDate && !resgateDateError && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="Valor do Resgate (R$)" required>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                            <input type="text" value={valor}
                              onChange={(e) => { setValor(formatCurrency(e.target.value)); setValidationErrors((prev) => { const n = new Set(prev); n.delete("valor"); return n; }); }}
                              placeholder="0,00"
                              className={`input-field pl-9 ${validationErrors.has("valor") ? "border-destructive ring-1 ring-destructive" : ""}`} />
                          </div>
                        </Field>
                        <Field label="Vencimento">
                          <input type="text" value={vencimento ? new Date(vencimento + "T00:00:00").toLocaleDateString("pt-BR") : "—"} disabled className="input-field opacity-60" />
                        </Field>
                      </div>

                      {categoriaSelecionada?.nome === "Moedas" && (
                        <div className="grid grid-cols-2 gap-4">
                          <Field label="Cotação da Negociação (R$)" required>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                              <input type="text" value={resgateCotacaoNeg}
                                onChange={(e) => setResgateCotacaoNeg(formatCotacao4(e.target.value))}
                                placeholder="0,0000" className="input-field pl-9" />
                            </div>
                            {resgateCotacaoRef != null && (
                              <p className="text-[11px] text-muted-foreground mt-1">
                                Cotação PTAX de referência: R$ {resgateCotacaoRef.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                              </p>
                            )}
                          </Field>
                          <Field label={`Valor resgatado em ${(() => { const pNome = produtos.find(p => p.id === selectedCustodia?.produto_id)?.nome || ""; return pNome.toLowerCase().includes("euro") ? "Euro" : "Dólar"; })()}`}>
                            <input type="text"
                              value={(() => { const cot = parseCurrencyToNumber(resgateCotacaoNeg); const val = parseCurrencyToNumber(valor); if (cot > 0 && val > 0) return (val / cot).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return ""; })()}
                              disabled placeholder="Calculado automaticamente" className="input-field opacity-60" />
                          </Field>
                        </div>
                      )}

                      <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
                        <p className="text-xs text-muted-foreground">Saldo disponível para resgate em {resgateDateInput}:</p>
                        <p className="text-sm font-semibold text-foreground mt-0.5">
                          {calculandoSaldo ? "Calculando..." : saldoDisponivel !== null ? fmtBrlDisplay(saldoDisponivel) : "—"}
                        </p>
                      </div>

                      {saldoDisponivel != null && saldoDisponivel > 0 && (
                        <div className="flex items-center gap-2">
                          <Checkbox id="fechar-posicao-cadastrar" checked={fecharPosicao}
                            onCheckedChange={(checked) => handleFecharPosicaoChange(!!checked)} />
                          <label htmlFor="fechar-posicao-cadastrar" className="text-sm font-medium text-foreground cursor-pointer">Fechar Posição</label>
                        </div>
                      )}

                      {valorResgateSuperaSaldo && (
                        <Alert variant="destructive">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>O valor do resgate (R$ {valor}) excede o saldo disponível ({fmtBrlDisplay(saldoDisponivel)}).</AlertDescription>
                        </Alert>
                      )}

                      <div className="grid grid-cols-2 gap-4">
                        <Field label={categoriaSelecionada?.nome === "Moedas" ? "Instituição" : "Corretora"}>
                          <input type="text" value={getInstituicaoNome(instituicaoId)} disabled className="input-field opacity-60" />
                        </Field>
                        <Field label="Emissor">
                          <input type="text" value={getEmissorNome(emissorId)} disabled className="input-field opacity-60" />
                        </Field>
                      </div>

                      <div className={`grid gap-4 ${isPosFixado ? "grid-cols-4" : "grid-cols-3"}`}>
                        <Field label="Modalidade"><input type="text" value={modalidade} disabled className="input-field opacity-60" /></Field>
                        {isPosFixado && <Field label="Indexador"><input type="text" value={indexador} disabled className="input-field opacity-60" /></Field>}
                        <Field label="Taxa"><input type="text" value={taxa ? `${taxa}%` : "—"} disabled className="input-field opacity-60" /></Field>
                        <Field label="Pagamento"><input type="text" value={pagamento} disabled className="input-field opacity-60" /></Field>
                      </div>

                      <div className="flex gap-3 pt-2">
                        <button type="button" onClick={onClose}
                          className="rounded-md bg-destructive px-5 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors">Cancelar</button>
                        <button type="button" onClick={handleSubmit} disabled={submitting || valorResgateSuperaSaldo}
                          className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[hsl(145,63%,32%)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[hsl(145,63%,28%)] transition-colors disabled:opacity-50">
                          <PlusCircle size={16} />{submitting ? "Enviando..." : "Registrar Resgate"}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function NativeSelect({ value, onChange, placeholder, options, disabled, hasError }: { value: string; onChange: (v: string) => void; placeholder: string; options: { value: string; label: string; disabled?: boolean }[]; disabled?: boolean; hasError?: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className={`input-field ${disabled ? "opacity-60" : ""} ${hasError ? "border-destructive ring-1 ring-destructive" : ""}`}
      disabled={disabled}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
    </select>
  );
}

function ActionButtons({ onCancel, onSubmit, submitting, isEditing, disabled }: { onCancel: () => void; onSubmit: () => void; submitting: boolean; isEditing: boolean; disabled?: boolean }) {
  return (
    <div className="flex gap-3 pt-2">
      <button type="button" onClick={onCancel}
        className="rounded-md bg-destructive px-5 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors">Cancelar</button>
      <button type="button" onClick={onSubmit} disabled={submitting || disabled}
        className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-[hsl(145,63%,32%)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[hsl(145,63%,28%)] transition-colors disabled:opacity-50">
        <PlusCircle size={16} />{submitting ? "Enviando..." : isEditing ? "Salvar Alterações" : "Cadastrar"}
      </button>
    </div>
  );
}

/** Global host: renders the dialog driven by BoletaModalContext */
export function GlobalCadastrarTransacaoDialog() {
  const { isOpen, origin, tipo, prefill, editId, closeBoleta } = useBoletaModal();
  return (
    <CadastrarTransacaoDialog
      open={isOpen}
      onClose={closeBoleta}
      origin={origin}
      initialTipo={tipo}
      prefill={prefill}
      editId={editId}
    />
  );
}
