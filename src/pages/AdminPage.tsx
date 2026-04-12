import { useState, useRef, useCallback } from "react";
import { read, utils, writeFile } from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fullSyncAfterMovimentacao } from "@/lib/syncEngine";
import { useDataReferencia } from "@/contexts/DataReferenciaContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Upload, Download, FileSpreadsheet, CheckCircle2, XCircle,
  AlertTriangle, Loader2, FileDown,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────
interface Categoria { id: string; nome: string }
interface Produto { id: string; nome: string; categoria_id: string }
interface Instituicao { id: string; nome: string }
interface Emissor { id: string; nome: string }

type ProductFamily = "rf_standard" | "poupanca" | "moeda";

interface RawRow {
  rowIndex: number;
  categoria: string;
  tipoMovimentacao: string;
  produto: string;
  data: string;
  instituicao: string;
  emissor: string;
  modalidade: string;
  indexador: string;
  taxa: string;
  valor: string;
  vencimento: string;
  pagamento: string;
  precoEmissao: string;
  nomeAtivoManual: string;
  observacoes: string;
}

interface ValidatedRow extends RawRow {
  errors: string[];
  family: ProductFamily;
  categoriaId: string;
  produtoId: string;
  instituicaoId: string;
  emissorId: string;
  dataISO: string;
  vencimentoISO: string;
  taxaNum: number;
  valorNum: number;
  puNum: number;
  modalidadeToSave: string | null;
  indexadorToSave: string | null;
  nomeAtivo: string;
  tipoFinal: string;
  cotacaoMoeda: number | null;
  quantidadeMoeda: number | null;
}

interface ImportResult {
  rowIndex: number;
  status: "success" | "error";
  nomeAtivo?: string;
  error?: string;
}

// ── Helpers ──────────────────────────────────────────
const PAGAMENTO_VALID = ["Mensal", "Bimestral", "Trimestral", "Quadrimestral", "Semestral", "Anual", "No Vencimento"];
const MODALIDADE_VALID = ["Prefixado", "Pós Fixado"];
const TIPO_MOV_VALID = ["Aplicação", "Resgate", "Resgate Total"];

function sigla(nome: string): string {
  return nome.replace(/\s*\(.*\)$/, "").trim();
}

function buildNomeAtivoRF(
  produtoNome: string, emissorNome: string, modalidade: string,
  taxa: string, vencimento: string, indexador: string,
): string {
  const prod = sigla(produtoNome);
  const taxaFmt = taxa ? `${taxa.replace(".", ",")}%` : "";
  const vencFmt = vencimento
    ? new Date(vencimento + "T00:00:00").toLocaleDateString("pt-BR")
    : "";

  if (modalidade === "Prefixado") {
    return [prod, emissorNome, modalidade, taxaFmt ? `${taxaFmt} a.a.` : "", vencFmt ? `- ${vencFmt}` : ""]
      .filter(Boolean).join(" ");
  }
  if (indexador === "IPCA") {
    return [prod, emissorNome, "IPCA", taxaFmt ? `+ ${taxaFmt} a.a.` : "", vencFmt ? `- ${vencFmt}` : ""]
      .filter(Boolean).join(" ");
  }
  if (indexador === "CDI") {
    return [prod, emissorNome, modalidade, taxaFmt, "do CDI", vencFmt ? `- ${vencFmt}` : ""]
      .filter(Boolean).join(" ");
  }
  return [prod, emissorNome, modalidade, indexador, taxaFmt, vencFmt ? `- ${vencFmt}` : ""]
    .filter(Boolean).join(" ");
}

function parseExcelDate(val: any): string | null {
  if (!val) return null;
  if (typeof val === "number") {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const iso = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    if (!isNaN(new Date(iso + "T00:00:00").getTime())) return iso;
  }
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m2) {
    if (!isNaN(new Date(s + "T00:00:00").getTime())) return s;
  }
  return null;
}

function parseNum(val: any): number {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const s = String(val).trim().replace(/[R$\s%]/g, "").replace(/\./g, "").replace(",", ".");
  return parseFloat(s) || 0;
}

function normalizeStr(val: any): string {
  return val ? String(val).trim() : "";
}

function fmtBR(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Determine the product family based on category and product names */
function getProductFamily(categoriaNome: string, produtoNome: string): ProductFamily {
  if (categoriaNome === "Moedas") return "moeda";
  if (produtoNome.toLowerCase() === "poupança") return "poupanca";
  return "rf_standard";
}

// ── Template download ──────────────────────────────
function downloadTemplate() {
  const headers = [
    "Categoria", "Tipo de Movimentação", "Produto", "Data da Transação",
    "Instituição / Corretora / Banco", "Emissor", "Modalidade", "Indexador",
    "Taxa", "Valor", "Vencimento", "Pagamento", "Preço de Emissão",
    "Nome do Ativo", "Observações",
  ];

  const examples = [
    [
      "Renda Fixa", "Aplicação", "CDB", "02/01/2024",
      "XP Investimentos", "Banco XP", "Pós Fixado", "CDI",
      "100", "10000", "02/01/2026", "No Vencimento", "1000", "", "",
    ],
    [
      "Renda Fixa", "Aplicação", "Poupança", "15/03/2024",
      "Banco do Brasil", "", "", "",
      "", "5000", "", "", "", "", "",
    ],
    [
      "Moedas", "Aplicação", "Dólar", "10/04/2024",
      "XP Investimentos", "", "", "",
      "", "2500", "", "", "", "", "",
    ],
    [
      "Moedas", "Aplicação", "Euro", "10/04/2024",
      "XP Investimentos", "", "", "",
      "", "3000", "", "", "", "", "",
    ],
    [
      "Renda Fixa", "Resgate", "CDB", "15/06/2024",
      "", "", "", "",
      "", "5000", "", "", "", "CDB Banco XP Pós Fixado 100% do CDI - 02/01/2026", "",
    ],
    [
      "Moedas", "Resgate Total", "Dólar", "20/08/2024",
      "", "", "", "",
      "", "2500", "", "", "", "Dólar XP Investimentos", "",
    ],
  ];

  const instructions = [
    ["INSTRUÇÕES DE PREENCHIMENTO"],
    [""],
    ["COLUNAS"],
    ["Categoria", "Renda Fixa ou Moedas (obrigatório)"],
    ["Tipo de Movimentação", "Aplicação, Resgate ou Resgate Total (obrigatório)"],
    ["Produto", "Nome do produto cadastrado no sistema: CDB, LCI, LCA, LF, LFS, LIG, LC, Debênture, Poupança, Dólar, Euro (obrigatório)"],
    ["Data da Transação", "Formato dd/mm/aaaa (obrigatório)"],
    ["Instituição / Corretora / Banco", "Nome da instituição cadastrada no sistema (obrigatório para Aplicação)"],
    ["Emissor", "Nome do emissor — somente para Renda Fixa padrão (CDB, LCI etc.)"],
    ["Modalidade", "Prefixado ou Pós Fixado — somente para Renda Fixa padrão"],
    ["Indexador", "CDI, CDI+ ou IPCA — somente se modalidade for Pós Fixado"],
    ["Taxa", "Valor numérico (ex: 100 para 100% do CDI, 12.5 para 12,5% a.a.) — somente para RF padrão"],
    ["Valor", "Valor financeiro em reais (obrigatório)"],
    ["Vencimento", "Data de vencimento dd/mm/aaaa — somente para Renda Fixa padrão"],
    ["Pagamento", "Mensal, Bimestral, Trimestral, Quadrimestral, Semestral, Anual ou No Vencimento — somente RF padrão"],
    ["Preço de Emissão", "PU na data da emissão — somente para Renda Fixa padrão"],
    ["Observações", "Campo livre (opcional)"],
    [""],
    ["REGRAS POR PRODUTO"],
    [""],
    ["Renda Fixa padrão (CDB, LCI, LCA, etc.)", "Exige: Emissor, Modalidade, Taxa, Vencimento, Pagamento, Preço de Emissão"],
    ["Poupança", "Exige apenas: Data, Valor, Instituição (Banco). Demais campos são ignorados."],
    ["Dólar / Euro", "Exige apenas: Data, Valor, Instituição. A cotação e quantidade são calculadas automaticamente."],
    [""],
    ["REGRAS POR TIPO DE MOVIMENTAÇÃO"],
    [""],
    ["Aplicação", "O sistema decide automaticamente se é Aplicação Inicial (primeiro aporte) ou Aplicação (aporte adicional)."],
    ["Resgate", "Para resgatar parcialmente. Preencha o nome do ativo existente via Produto + Instituição + campos que identifiquem o ativo."],
    ["Resgate Total", "Para fechar a posição inteira. Mesma lógica do Resgate."],
    [""],
    ["OBSERVAÇÕES GERAIS"],
    ["- Nomes de Instituição e Emissor devem corresponder aos cadastrados no sistema"],
    ["- Para Resgates/Resgates Totais, o sistema localiza o ativo existente pelo nome_ativo gerado"],
    ["- O sistema valida dia útil, vencimento > data, e demais regras de negócio"],
    ["- Linhas com erros são ignoradas; apenas linhas válidas são processadas"],
  ];

  const wb = utils.book_new();
  const wsData = utils.aoa_to_sheet([headers, ...examples]);
  wsData["!cols"] = headers.map(() => ({ wch: 22 }));
  utils.book_append_sheet(wb, wsData, "Dados");

  const wsInstr = utils.aoa_to_sheet(instructions);
  wsInstr["!cols"] = [{ wch: 40 }, { wch: 80 }];
  utils.book_append_sheet(wb, wsInstr, "Instruções");

  writeFile(wb, "Modelo_Importacao_Universal.xlsx");
}

// ── Main component ──────────────────────────────
export default function AdminPage() {
  const { user } = useAuth();
  const { dataReferenciaISO, applyDataReferencia } = useDataReferencia();
  const fileRef = useRef<HTMLInputElement>(null);

  const [validatedRows, setValidatedRows] = useState<ValidatedRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [phase, setPhase] = useState<"idle" | "preview" | "processing" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");

  // Ref data
  const [refLoaded, setRefLoaded] = useState(false);

  const loadRefData = useCallback(async () => {
    const [catRes, prodRes, instRes, emisRes] = await Promise.all([
      supabase.from("categorias").select("id, nome").eq("ativa", true),
      supabase.from("produtos").select("id, nome, categoria_id").eq("ativo", true),
      supabase.from("instituicoes").select("id, nome").eq("ativa", true),
      supabase.from("emissores").select("id, nome").eq("ativo", true),
    ]);
    const catData = (catRes.data || []) as Categoria[];
    const prodData = (prodRes.data || []) as Produto[];
    const instData = (instRes.data || []) as Instituicao[];
    const emisData = (emisRes.data || []) as Emissor[];
    setRefLoaded(true);
    return { categorias: catData, produtos: prodData, instituicoes: instData, emissores: emisData };
  }, []);

  // ── Parse Excel ──
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const refData = await loadRefData();

    const buffer = await file.arrayBuffer();
    const wb = read(buffer, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const json: any[] = utils.sheet_to_json(ws, { defval: "" });

    if (json.length === 0) {
      toast.error("Arquivo vazio ou sem dados válidos.");
      return;
    }

    const parsed: RawRow[] = json.map((row, i) => ({
      rowIndex: i + 2,
      categoria: normalizeStr(row["Categoria"]),
      tipoMovimentacao: normalizeStr(row["Tipo de Movimentação"] ?? row["Tipo de Movimentacao"] ?? ""),
      produto: normalizeStr(row["Produto"] ?? ""),
      data: row["Data da Transação"] ?? row["Data da Transacao"] ?? "",
      instituicao: normalizeStr(row["Instituição / Corretora / Banco"] ?? row["Instituicao / Corretora / Banco"] ?? row["Corretora"] ?? ""),
      emissor: normalizeStr(row["Emissor"] ?? ""),
      modalidade: normalizeStr(row["Modalidade"] ?? ""),
      indexador: normalizeStr(row["Indexador"] ?? ""),
      taxa: normalizeStr(row["Taxa"] ?? ""),
      valor: row["Valor"] ?? "",
      vencimento: row["Vencimento"] ?? "",
      pagamento: normalizeStr(row["Pagamento"] ?? ""),
      precoEmissao: row["Preço de Emissão"] ?? row["Preco de Emissao"] ?? row["Preço de Emissao"] ?? "",
      observacoes: normalizeStr(row["Observações"] ?? row["Observacoes"] ?? ""),
    }));

    const validated = await validateRows(parsed, refData);
    setValidatedRows(validated);
    setPhase("preview");
    setResults([]);
  };

  const validateRows = async (
    rows: RawRow[],
    refData: { categorias: Categoria[]; produtos: Produto[]; instituicoes: Instituicao[]; emissores: Emissor[] }
  ): Promise<ValidatedRow[]> => {
    const { categorias: cats, produtos: prods, instituicoes: insts, emissores: emis } = refData;

    // Load calendar for date validation
    const allDates = rows.map(r => parseExcelDate(r.data)).filter(Boolean) as string[];
    let calMap = new Map<string, boolean>();
    if (allDates.length > 0) {
      const sorted = [...allDates].sort();
      const { data: calData } = await supabase
        .from("calendario_dias_uteis")
        .select("data, dia_util")
        .gte("data", sorted[0])
        .lte("data", sorted[sorted.length - 1]);
      for (const c of calData || []) {
        calMap.set(c.data, c.dia_util);
      }
    }

    // Pre-fetch cotações for moeda rows
    const moedaDates = new Map<string, Set<string>>(); // "dolar"|"euro" -> dates
    for (const row of rows) {
      const cat = cats.find(c => c.nome.toLowerCase() === row.categoria.toLowerCase());
      if (cat?.nome === "Moedas") {
        const pNome = row.produto.toLowerCase();
        const key = pNome.includes("euro") ? "euro" : "dolar";
        const dateISO = parseExcelDate(row.data);
        if (dateISO) {
          if (!moedaDates.has(key)) moedaDates.set(key, new Set());
          moedaDates.get(key)!.add(dateISO);
        }
      }
    }

    const cotacaoCache = new Map<string, number>(); // "dolar:2024-01-02" -> cotacao
    for (const [moeda, dates] of moedaDates) {
      const table = moeda === "euro" ? "historico_euro" : "historico_dolar";
      const dateArr = [...dates];
      const { data: cotRows } = await supabase
        .from(table)
        .select("data, cotacao_venda")
        .in("data", dateArr);
      for (const r of cotRows || []) {
        cotacaoCache.set(`${moeda}:${r.data}`, r.cotacao_venda);
      }
    }

    return rows.map(row => {
      const errors: string[] = [];

      // ── Category ──
      const cat = cats.find(c => c.nome.toLowerCase() === row.categoria.toLowerCase());
      if (!cat) {
        errors.push(`Categoria "${row.categoria}" não encontrada`);
      } else {
        const allowed = ["Renda Fixa", "Moedas"];
        if (!allowed.includes(cat.nome)) {
          errors.push(`Categoria "${row.categoria}" não suportada (use Renda Fixa ou Moedas)`);
        }
      }

      // ── Tipo Movimentação ──
      const tipoMov = row.tipoMovimentacao || "Aplicação";
      if (!TIPO_MOV_VALID.includes(tipoMov)) {
        errors.push(`Tipo de Movimentação "${tipoMov}" inválido (use Aplicação, Resgate ou Resgate Total)`);
      }
      const isResgate = tipoMov === "Resgate" || tipoMov === "Resgate Total";

      // ── Produto ──
      const produtoNomeRaw = row.produto || "";
      if (!produtoNomeRaw) {
        errors.push("Produto é obrigatório");
      }
      const prod = cat ? prods.find(p =>
        p.categoria_id === cat.id && sigla(p.nome).toLowerCase() === produtoNomeRaw.toLowerCase()
      ) : null;
      if (cat && produtoNomeRaw && !prod) {
        errors.push(`Produto "${produtoNomeRaw}" não encontrado na categoria "${row.categoria}"`);
      }

      // Determine family
      const family = cat && prod
        ? getProductFamily(cat.nome, prod.nome)
        : "rf_standard";

      // ── Date ──
      const dataISO = parseExcelDate(row.data);
      if (!dataISO) {
        errors.push("Data da transação inválida");
      } else if (calMap.size > 0 && family === "rf_standard") {
        // Business-day validation only for RF standard
        const isUtil = calMap.get(dataISO);
        if (isUtil === false) errors.push("Data da transação não é dia útil");
        else if (isUtil === undefined) errors.push("Data da transação fora do calendário");
      }

      // ── Valor ──
      const valorNum = parseNum(row.valor);
      if (valorNum <= 0) errors.push("Valor deve ser maior que zero");

      // ── Instituição (obrigatória para aplicação) ──
      let inst: Instituicao | undefined;
      if (!isResgate) {
        inst = insts.find(i => i.nome.toLowerCase() === row.instituicao.toLowerCase());
        if (!row.instituicao) {
          errors.push("Instituição / Corretora / Banco é obrigatória para Aplicação");
        } else if (!inst) {
          errors.push(`Instituição "${row.instituicao}" não encontrada`);
        }
      } else {
        // For resgates, instituição is optional (will be copied from custodia)
        inst = row.instituicao ? insts.find(i => i.nome.toLowerCase() === row.instituicao.toLowerCase()) : undefined;
      }

      // ── Family-specific validation ──
      let emissor: Emissor | undefined;
      let taxaNum = 0;
      let puNum = 0;
      let vencISO = "";
      let modalidadeToSave: string | null = null;
      let indexadorToSave: string | null = null;
      let cotacaoMoeda: number | null = null;
      let quantidadeMoeda: number | null = null;

      if (family === "rf_standard" && !isResgate) {
        // Full RF validation
        emissor = emis.find(e => e.nome.toLowerCase() === row.emissor.toLowerCase());
        if (!emissor) errors.push(`Emissor "${row.emissor}" não encontrado`);

        if (!MODALIDADE_VALID.includes(row.modalidade)) errors.push(`Modalidade "${row.modalidade}" inválida`);

        const isPosFixado = row.modalidade === "Pós Fixado";
        if (isPosFixado && !["CDI", "CDI+", "IPCA"].includes(row.indexador)) {
          errors.push(`Indexador "${row.indexador}" inválido para Pós Fixado (use CDI, CDI+ ou IPCA)`);
        }

        taxaNum = parseNum(row.taxa);
        if (taxaNum <= 0) errors.push("Taxa deve ser maior que zero");

        const vencParsed = parseExcelDate(row.vencimento);
        if (!vencParsed) {
          errors.push("Vencimento inválido");
        } else if (dataISO && vencParsed <= dataISO) {
          errors.push("Vencimento deve ser posterior à data da transação");
        }
        vencISO = vencParsed || "";

        const pagamento = row.pagamento || "No Vencimento";
        if (!PAGAMENTO_VALID.includes(pagamento)) errors.push(`Pagamento "${pagamento}" inválido`);

        puNum = parseNum(row.precoEmissao);
        if (puNum <= 0) errors.push("Preço de Emissão deve ser maior que zero");

        // Modalidade mapping
        modalidadeToSave = row.modalidade;
        indexadorToSave = isPosFixado ? row.indexador : null;
        if (row.modalidade === "Pós Fixado" && row.indexador === "CDI+") {
          modalidadeToSave = "Mista";
          indexadorToSave = "CDI";
        }
      } else if (family === "moeda" && !isResgate) {
        // Moeda: lookup cotação
        if (dataISO && prod) {
          const moedaKey = prod.nome.toLowerCase().includes("euro") ? "euro" : "dolar";
          const cot = cotacaoCache.get(`${moedaKey}:${dataISO}`);
          if (cot) {
            cotacaoMoeda = cot;
            quantidadeMoeda = valorNum / cot;
          } else {
            errors.push(`Cotação do ${prod.nome} não encontrada para ${dataISO}`);
          }
        }
      }
      // poupanca and resgates: no additional validation needed

      // ── Build nome_ativo ──
      let nomeAtivo = "";
      if (prod && !isResgate) {
        if (family === "rf_standard" && emissor) {
          nomeAtivo = buildNomeAtivoRF(
            prod.nome, emissor.nome, modalidadeToSave || "", String(taxaNum), vencISO, indexadorToSave || ""
          );
        } else if (family === "poupanca" && inst) {
          nomeAtivo = `Poupança ${inst.nome}`.trim();
        } else if (family === "moeda" && inst) {
          nomeAtivo = `${prod.nome} ${inst.nome}`.trim();
        }
      }

      return {
        ...row,
        errors,
        family,
        categoriaId: cat?.id || "",
        produtoId: prod?.id || "",
        instituicaoId: inst?.id || "",
        emissorId: emissor?.id || "",
        dataISO: dataISO || "",
        vencimentoISO: vencISO,
        taxaNum,
        valorNum,
        puNum,
        modalidadeToSave,
        indexadorToSave,
        nomeAtivo,
        tipoFinal: tipoMov,
        cotacaoMoeda,
        quantidadeMoeda,
      };
    });
  };

  // ── Process import ──
  const processImport = async () => {
    if (!user) return;
    const validRows = validatedRows.filter(r => r.errors.length === 0);
    if (validRows.length === 0) {
      toast.error("Nenhuma linha válida para processar.");
      return;
    }

    setPhase("processing");
    setProgress(0);
    const importResults: ImportResult[] = [];

    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i];
      setProgress(Math.round(((i) / validRows.length) * 100));

      try {
        const isResgate = row.tipoFinal === "Resgate" || row.tipoFinal === "Resgate Total";

        if (isResgate) {
          await processResgate(row, user.id);
        } else {
          await processAplicacao(row, user.id);
        }

        importResults.push({ rowIndex: row.rowIndex, status: "success", nomeAtivo: row.nomeAtivo });
      } catch (err: any) {
        importResults.push({
          rowIndex: row.rowIndex,
          status: "error",
          nomeAtivo: row.nomeAtivo || `Linha ${row.rowIndex}`,
          error: err?.message || "Erro desconhecido",
        });
      }
    }

    // Add skipped rows (with validation errors) to results
    for (const row of validatedRows.filter(r => r.errors.length > 0)) {
      importResults.push({
        rowIndex: row.rowIndex,
        status: "error",
        nomeAtivo: row.nomeAtivo || `Linha ${row.rowIndex}`,
        error: row.errors.join("; "),
      });
    }

    importResults.sort((a, b) => a.rowIndex - b.rowIndex);
    setResults(importResults);
    setProgress(100);
    setPhase("done");
    applyDataReferencia();
    toast.success("Importação concluída!");
  };

  /** Process an Aplicação row (handles auto Aplicação Inicial detection) */
  const processAplicacao = async (row: ValidatedRow, userId: string) => {
    // 1. Determine codigo_custodia & tipo final
    let codigoCustodia: number;
    let tipoFinal = "Aplicação";

    const { data: existing } = await supabase
      .from("movimentacoes")
      .select("codigo_custodia")
      .eq("nome_ativo", row.nomeAtivo)
      .eq("user_id", userId)
      .not("codigo_custodia", "is", null)
      .limit(1);

    if (existing && existing.length > 0) {
      codigoCustodia = existing[0].codigo_custodia!;
    } else {
      const { data: maxRow } = await supabase
        .from("movimentacoes")
        .select("codigo_custodia")
        .eq("user_id", userId)
        .not("codigo_custodia", "is", null)
        .order("codigo_custodia", { ascending: false })
        .limit(1);
      codigoCustodia = (maxRow?.[0]?.codigo_custodia ?? 99) + 1;
      tipoFinal = "Aplicação Inicial";
    }

    // 2. Build fields per family
    let puFinal: number | null = null;
    let taxaFinal: number | null = null;
    let quantidade: number | null = null;
    let modalidadeFinal: string | null = null;
    let indexadorFinal: string | null = null;
    let pagamentoFinal: string | null = null;
    let vencimentoFinal: string | null = null;
    let emissorIdFinal: string | null = null;

    if (row.family === "rf_standard") {
      puFinal = row.puNum;
      taxaFinal = row.taxaNum;
      quantidade = puFinal > 0 ? row.valorNum / puFinal : null;
      modalidadeFinal = row.modalidadeToSave;
      indexadorFinal = row.indexadorToSave;
      pagamentoFinal = row.pagamento || "No Vencimento";
      vencimentoFinal = row.vencimentoISO || null;
      emissorIdFinal = row.emissorId || null;
    } else if (row.family === "poupanca") {
      modalidadeFinal = "Poupança";
      pagamentoFinal = "Mensal";
      // Match emissor to instituição name (same logic as boleta manual)
      if (row.instituicaoId) {
        const { data: instData } = await supabase.from("instituicoes").select("nome").eq("id", row.instituicaoId).single();
        if (instData) {
          const { data: emissorMatch } = await supabase.from("emissores").select("id").eq("nome", instData.nome).maybeSingle();
          emissorIdFinal = emissorMatch?.id || null;
        }
      }
    } else if (row.family === "moeda") {
      puFinal = row.cotacaoMoeda;
      quantidade = row.quantidadeMoeda;
    }

    // 3. Build valor_extrato
    const valorExtrato = quantidade != null && puFinal
      ? `R$ ${fmtBR(row.valorNum)} (R$ ${fmtBR(puFinal)} x ${fmtBR(quantidade)})`
      : `R$ ${fmtBR(row.valorNum)}`;

    // 4. Insert movimentação
    const movId = crypto.randomUUID();
    const { error } = await supabase.from("movimentacoes").insert({
      id: movId,
      categoria_id: row.categoriaId,
      tipo_movimentacao: tipoFinal,
      data: row.dataISO,
      produto_id: row.produtoId,
      valor: row.valorNum,
      preco_unitario: puFinal,
      instituicao_id: row.instituicaoId || null,
      emissor_id: emissorIdFinal,
      modalidade: modalidadeFinal,
      taxa: taxaFinal,
      pagamento: pagamentoFinal,
      vencimento: vencimentoFinal,
      nome_ativo: row.nomeAtivo,
      codigo_custodia: codigoCustodia,
      indexador: indexadorFinal,
      quantidade,
      valor_extrato: valorExtrato,
      user_id: userId,
      origem: "importacao_lote",
    });

    if (error) throw error;

    // 5. Full sync
    await fullSyncAfterMovimentacao(movId, row.categoriaId, userId, dataReferenciaISO);
  };

  /** Process a Resgate or Resgate Total row */
  const processResgate = async (row: ValidatedRow, userId: string) => {
    // Find matching custodia by building expected nome_ativo or searching
    // For resgates, we need to find the existing position
    // Strategy: if nomeAtivo is populated, use it. Otherwise search by product + instituição.

    let custodia: any = null;

    if (row.nomeAtivo) {
      const { data } = await supabase
        .from("custodia")
        .select("*")
        .eq("nome", row.nomeAtivo)
        .eq("user_id", userId)
        .maybeSingle();
      custodia = data;
    }

    // Fallback: search by product + category
    if (!custodia && row.produtoId && row.categoriaId) {
      const { data } = await supabase
        .from("custodia")
        .select("*")
        .eq("produto_id", row.produtoId)
        .eq("categoria_id", row.categoriaId)
        .eq("user_id", userId)
        .is("resgate_total", null);

      if (data && data.length === 1) {
        custodia = data[0];
      } else if (data && data.length > 1 && row.instituicaoId) {
        custodia = data.find((c: any) => c.instituicao_id === row.instituicaoId) || null;
      }
    }

    if (!custodia) {
      throw new Error(`Posição ativa não encontrada para "${row.nomeAtivo || row.produto}". Verifique se o ativo existe na custódia.`);
    }

    // For moedas resgate, lookup cotação
    let resgateQty: number | null = null;
    let resgatePU: number | null = null;
    if (row.family === "moeda" && row.cotacaoMoeda) {
      resgatePU = row.cotacaoMoeda;
      resgateQty = row.valorNum / row.cotacaoMoeda;
    }

    const tipoFinal = row.tipoFinal;

    const { error } = await supabase.from("movimentacoes").insert({
      categoria_id: custodia.categoria_id,
      tipo_movimentacao: tipoFinal,
      data: row.dataISO,
      produto_id: custodia.produto_id,
      valor: row.valorNum,
      preco_unitario: row.family === "moeda" ? resgatePU : null,
      instituicao_id: custodia.instituicao_id,
      emissor_id: custodia.emissor_id,
      modalidade: custodia.modalidade,
      taxa: custodia.taxa,
      pagamento: custodia.pagamento,
      vencimento: custodia.vencimento,
      nome_ativo: custodia.nome,
      codigo_custodia: custodia.codigo_custodia,
      indexador: custodia.indexador,
      quantidade: row.family === "moeda" ? resgateQty : null,
      valor_extrato: `R$ ${fmtBR(row.valorNum)}`,
      user_id: userId,
      origem: "importacao_lote",
    });

    if (error) throw error;

    // Get inserted id
    const { data: inserted } = await supabase
      .from("movimentacoes")
      .select("id")
      .eq("codigo_custodia", custodia.codigo_custodia)
      .eq("user_id", userId)
      .eq("tipo_movimentacao", tipoFinal)
      .order("created_at", { ascending: false })
      .limit(1);

    const insertedId = inserted?.[0]?.id || null;
    await fullSyncAfterMovimentacao(insertedId, custodia.categoria_id, userId, dataReferenciaISO);
  };

  // ── Export errors ──
  const downloadErrors = () => {
    const errorRows = results.filter(r => r.status === "error");
    if (errorRows.length === 0) return;
    const data = errorRows.map(r => ({
      Linha: r.rowIndex,
      Ativo: r.nomeAtivo || "",
      Erro: r.error || "",
    }));
    const ws = utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 8 }, { wch: 50 }, { wch: 60 }];
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Erros");
    writeFile(wb, "Erros_Importacao.xlsx");
  };

  // ── Reset ──
  const reset = () => {
    setPhase("idle");
    setValidatedRows([]);
    setResults([]);
    setProgress(0);
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  // ── Derived stats ──
  const totalRows = validatedRows.length;
  const validCount = validatedRows.filter(r => r.errors.length === 0).length;
  const errorCount = totalRows - validCount;
  const successCount = results.filter(r => r.status === "success").length;
  const failCount = results.filter(r => r.status === "error").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Admin</h1>
        <p className="text-xs text-muted-foreground">Ferramentas administrativas do sistema</p>
      </div>

      {/* ── Import Card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileSpreadsheet size={16} />
            Importar Movimentações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Idle */}
          {phase === "idle" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Importe movimentações em lote via Excel (.xlsx). Suporta Renda Fixa (incluindo Poupança) e Moedas (Dólar e Euro),
                com Aplicação, Resgate e Resgate Total.
              </p>

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download size={14} className="mr-1" />
                  Baixar modelo
                </Button>
                <Button size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload size={14} className="mr-1" />
                  Selecionar arquivo
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleFile}
                />
              </div>

              <div className="rounded border border-dashed border-muted-foreground/30 p-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">Colunas esperadas:</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1 text-xs text-muted-foreground">
                  {[
                    "Categoria", "Tipo de Movimentação", "Produto", "Data da Transação",
                    "Instituição / Corretora / Banco", "Emissor", "Modalidade", "Indexador",
                    "Taxa", "Valor", "Vencimento", "Pagamento", "Preço de Emissão", "Observações",
                  ].map(c => (
                    <span key={c} className="bg-muted px-2 py-0.5 rounded">{c}</span>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Preencha apenas os campos aplicáveis ao produto. Poupança e Moedas exigem menos campos que RF padrão.
                </p>
              </div>
            </div>
          )}

          {/* Preview */}
          {phase === "preview" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  Arquivo: <span className="text-muted-foreground">{fileName}</span>
                </p>
                <Button variant="ghost" size="sm" onClick={reset}>Nova importação</Button>
              </div>

              {/* Stats */}
              <div className="flex gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <FileSpreadsheet size={14} />
                  <span>{totalRows} linhas</span>
                </div>
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 size={14} />
                  <span>{validCount} válidas</span>
                </div>
                {errorCount > 0 && (
                  <div className="flex items-center gap-1 text-destructive">
                    <XCircle size={14} />
                    <span>{errorCount} com erro</span>
                  </div>
                )}
              </div>

              {/* Error list */}
              {errorCount > 0 && (
                <div className="max-h-48 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16 text-xs">Linha</TableHead>
                        <TableHead className="text-xs">Erro(s)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validatedRows.filter(r => r.errors.length > 0).map(r => (
                        <TableRow key={r.rowIndex}>
                          <TableCell className="text-xs font-mono">{r.rowIndex}</TableCell>
                          <TableCell className="text-xs text-destructive">
                            {r.errors.map((e, i) => <div key={i}>• {e}</div>)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Valid preview table */}
              {validCount > 0 && (
                <div className="max-h-64 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Linha</TableHead>
                        <TableHead className="text-xs">Tipo</TableHead>
                        <TableHead className="text-xs">Família</TableHead>
                        <TableHead className="text-xs">Ativo</TableHead>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-xs text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validatedRows.filter(r => r.errors.length === 0).map(r => (
                        <TableRow key={r.rowIndex}>
                          <TableCell className="text-xs font-mono">{r.rowIndex}</TableCell>
                          <TableCell className="text-xs">{r.tipoFinal}</TableCell>
                          <TableCell className="text-xs capitalize">
                            {r.family === "rf_standard" ? "RF" : r.family === "poupanca" ? "Poupança" : "Moeda"}
                          </TableCell>
                          <TableCell className="text-xs truncate max-w-[200px]">
                            {r.nomeAtivo || r.produto}
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.dataISO ? new Date(r.dataISO + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-right">R$ {fmtBR(r.valorNum)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={reset}>Cancelar</Button>
                <Button
                  size="sm"
                  onClick={processImport}
                  disabled={validCount === 0}
                >
                  Processar {validCount} {validCount === 1 ? "linha" : "linhas"}
                </Button>
              </div>

              {errorCount > 0 && validCount > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    {errorCount} {errorCount === 1 ? "linha será ignorada" : "linhas serão ignoradas"} por conter erros.
                    Apenas as {validCount} linhas válidas serão processadas.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Processing */}
          {phase === "processing" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
                Processando importação...
              </div>
              <Progress value={progress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {Math.round((progress / 100) * validCount)} de {validCount} linhas processadas
              </p>
            </div>
          )}

          {/* Done */}
          {phase === "done" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CheckCircle2 size={16} className="text-green-600" />
                Importação concluída
              </div>

              <div className="flex gap-4 text-xs">
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 size={14} />
                  <span>{successCount} importadas</span>
                </div>
                {failCount > 0 && (
                  <div className="flex items-center gap-1 text-destructive">
                    <XCircle size={14} />
                    <span>{failCount} falharam</span>
                  </div>
                )}
              </div>

              {/* Results table */}
              <div className="max-h-64 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 text-xs">Linha</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Ativo</TableHead>
                      <TableHead className="text-xs">Detalhe</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map(r => (
                      <TableRow key={r.rowIndex}>
                        <TableCell className="text-xs font-mono">{r.rowIndex}</TableCell>
                        <TableCell>
                          {r.status === "success"
                            ? <CheckCircle2 size={14} className="text-green-600" />
                            : <XCircle size={14} className="text-destructive" />}
                        </TableCell>
                        <TableCell className="text-xs truncate max-w-[200px]">{r.nomeAtivo}</TableCell>
                        <TableCell className="text-xs text-destructive">{r.error || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {failCount > 0 && (
                  <Button variant="outline" size="sm" onClick={downloadErrors}>
                    <FileDown size={14} className="mr-1" />
                    Baixar erros
                  </Button>
                )}
                <Button size="sm" onClick={reset}>Nova importação</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
