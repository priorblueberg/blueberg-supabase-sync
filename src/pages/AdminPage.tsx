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

interface RawRow {
  rowIndex: number;
  categoria: string;
  data: string;
  corretora: string;
  modalidade: string;
  taxa: string;
  valor: string;
  vencimento: string;
  emissor: string;
  pagamento: string;
  precoEmissao: string;
  indexador?: string;
  produto?: string;
}

interface ValidatedRow extends RawRow {
  errors: string[];
  categoriaId: string;
  produtoId: string;
  instituicaoId: string;
  emissorId: string;
  dataISO: string;
  vencimentoISO: string;
  taxaNum: number;
  valorNum: number;
  puNum: number;
  modalidadeToSave: string;
  indexadorToSave: string | null;
  nomeAtivo: string;
}

interface ImportResult {
  rowIndex: number;
  status: "success" | "error";
  nomeAtivo?: string;
  error?: string;
}

// ── Helpers ──────────────────────────────────────────
const PAGAMENTO_VALID = ["Mensal", "Bimestral", "Trimestral", "Quadrimestral", "Semestral", "No Vencimento"];
const MODALIDADE_VALID = ["Prefixado", "Pós Fixado"];

function sigla(nome: string): string {
  return nome.replace(/\s*\(.*\)$/, "").trim();
}

function buildNomeAtivo(
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
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const iso = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    if (!isNaN(new Date(iso + "T00:00:00").getTime())) return iso;
  }
  // yyyy-mm-dd
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

// ── Template download ──────────────────────────────
function downloadTemplate() {
  const headers = [
    "Categoria", "Data da Transação", "Corretora", "Modalidade",
    "Indexador", "Taxa", "Valor", "Vencimento", "Emissor",
    "Pagamento", "Preço de Emissão", "Produto",
  ];
  const example = [
    "Renda Fixa", "02/01/2024", "XP Investimentos", "Pós Fixado",
    "CDI", "100", "10000", "02/01/2026", "Banco XP",
    "No Vencimento", "1000", "CDB",
  ];
  const instructions = [
    ["INSTRUÇÕES DE PREENCHIMENTO"],
    [""],
    ["Categoria", "Renda Fixa (obrigatório)"],
    ["Data da Transação", "Formato dd/mm/aaaa — deve ser dia útil"],
    ["Corretora", "Nome da instituição (deve existir no sistema)"],
    ["Modalidade", "Prefixado ou Pós Fixado"],
    ["Indexador", "CDI, CDI+ ou IPCA (obrigatório se Pós Fixado)"],
    ["Taxa", "Valor numérico (ex: 100 para 100% do CDI, 12.5 para 12,5% a.a.)"],
    ["Valor", "Valor financeiro da aplicação em reais"],
    ["Vencimento", "Data de vencimento no formato dd/mm/aaaa"],
    ["Emissor", "Nome do emissor (deve existir no sistema)"],
    ["Pagamento", "Mensal, Bimestral, Trimestral, Quadrimestral, Semestral ou No Vencimento"],
    ["Preço de Emissão", "PU na data da emissão (preço unitário)"],
    ["Produto", "CDB, LCI, LCA, LF, LFS, LIG, LC, Debênture (se vazio, usa CDB)"],
    [""],
    ["OBSERVAÇÕES:"],
    ["- Cada linha gera uma Aplicação Inicial"],
    ["- Nomes de Corretora e Emissor devem corresponder aos cadastrados no sistema"],
    ["- O sistema valida dia útil, vencimento > data, e demais regras de negócio"],
  ];

  const wb = utils.book_new();
  const wsData = utils.aoa_to_sheet([headers, example]);
  wsData["!cols"] = headers.map(() => ({ wch: 20 }));
  utils.book_append_sheet(wb, wsData, "Dados");

  const wsInstr = utils.aoa_to_sheet(instructions);
  wsInstr["!cols"] = [{ wch: 25 }, { wch: 60 }];
  utils.book_append_sheet(wb, wsInstr, "Instruções");

  writeFile(wb, "Modelo_Importacao_Aplicacoes.xlsx");
}

// ── Main component ──────────────────────────────
export default function AdminPage() {
  const { user } = useAuth();
  const { dataReferenciaISO, applyDataReferencia } = useDataReferencia();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [validatedRows, setValidatedRows] = useState<ValidatedRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [phase, setPhase] = useState<"idle" | "preview" | "processing" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");

  // Ref data
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [instituicoes, setInstituicoes] = useState<Instituicao[]>([]);
  const [emissores, setEmissores] = useState<Emissor[]>([]);
  const [refLoaded, setRefLoaded] = useState(false);

  const loadRefData = useCallback(async () => {
    const [catRes, prodRes, instRes, emisRes] = await Promise.all([
      supabase.from("categorias").select("id, nome").eq("ativa", true),
      supabase.from("produtos").select("id, nome, categoria_id").eq("ativo", true),
      supabase.from("instituicoes").select("id, nome").eq("ativa", true),
      supabase.from("emissores").select("id, nome").eq("ativo", true),
    ]);
    const catData = catRes.data || [];
    const prodData = prodRes.data || [];
    const instData = instRes.data || [];
    const emisData = emisRes.data || [];
    setCategorias(catData);
    setProdutos(prodData);
    setInstituicoes(instData);
    setEmissores(emisData);
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
      data: row["Data da Transação"] ?? row["Data da Transacao"] ?? "",
      corretora: normalizeStr(row["Corretora"]),
      modalidade: normalizeStr(row["Modalidade"]),
      taxa: normalizeStr(row["Taxa"]),
      valor: row["Valor"] ?? "",
      vencimento: row["Vencimento"] ?? "",
      emissor: normalizeStr(row["Emissor"]),
      pagamento: normalizeStr(row["Pagamento"]),
      precoEmissao: row["Preço de Emissão"] ?? row["Preco de Emissao"] ?? row["Preço de Emissao"] ?? "",
      indexador: normalizeStr(row["Indexador"] ?? ""),
      produto: normalizeStr(row["Produto"] ?? ""),
    }));

    setRawRows(parsed);

    const validated = await validateRows(parsed, refData);
    setValidatedRows(validated);
    setPhase("preview");
    setResults([]);
  };

  const validateRows = async (rows: RawRow[], refData: { categorias: Categoria[]; produtos: Produto[]; instituicoes: Instituicao[]; emissores: Emissor[] }): Promise<ValidatedRow[]> => {
    const { categorias: cats, produtos: prods, instituicoes: insts, emissores: emis } = refData;
    // Load business-day calendar for validation
    const allDates = rows.map(r => parseExcelDate(r.data)).filter(Boolean) as string[];
    let calMap = new Map<string, boolean>();
    if (allDates.length > 0) {
      const minDate = allDates.sort()[0];
      const maxDate = allDates.sort()[allDates.length - 1];
      const { data: calData } = await supabase
        .from("calendario_dias_uteis")
        .select("data, dia_util")
        .gte("data", minDate)
        .lte("data", maxDate);
      for (const c of calData || []) {
        calMap.set(c.data, c.dia_util);
      }
    }

    return rows.map(row => {
      const errors: string[] = [];

      // Category
      const cat = cats.find(c => c.nome.toLowerCase() === row.categoria.toLowerCase());
      if (!cat) errors.push(`Categoria "${row.categoria}" não encontrada`);
      const isRendaFixa = cat?.nome === "Renda Fixa";
      if (cat && !isRendaFixa) errors.push(`Categoria "${row.categoria}" não suportada nesta importação`);

      // Date
      const dataISO = parseExcelDate(row.data);
      if (!dataISO) {
        errors.push("Data da transação inválida");
      } else if (calMap.size > 0) {
        const isUtil = calMap.get(dataISO);
        if (isUtil === false) errors.push("Data da transação não é dia útil");
        else if (isUtil === undefined) errors.push("Data da transação fora do calendário");
      }

      // Corretora
      const inst = insts.find(i => i.nome.toLowerCase() === row.corretora.toLowerCase());
      if (!inst) errors.push(`Corretora "${row.corretora}" não encontrada`);

      // Modalidade
      const modalidade = row.modalidade;
      if (!MODALIDADE_VALID.includes(modalidade)) errors.push(`Modalidade "${modalidade}" inválida`);

      // Indexador (obrigatório para Pós Fixado)
      const isPosFixado = modalidade === "Pós Fixado";
      const indexadorRaw = row.indexador || "";
      if (isPosFixado && !["CDI", "CDI+", "IPCA"].includes(indexadorRaw)) {
        errors.push(`Indexador "${indexadorRaw}" inválido para Pós Fixado (use CDI, CDI+ ou IPCA)`);
      }

      // Taxa
      const taxaNum = parseNum(row.taxa);
      if (taxaNum <= 0) errors.push("Taxa deve ser maior que zero");

      // Valor
      const valorNum = parseNum(row.valor);
      if (valorNum <= 0) errors.push("Valor deve ser maior que zero");

      // Vencimento
      const vencISO = parseExcelDate(row.vencimento);
      if (!vencISO) {
        errors.push("Vencimento inválido");
      } else if (dataISO && vencISO <= dataISO) {
        errors.push("Vencimento deve ser posterior à data da transação");
      }

      // Emissor
      const emissor = emis.find(e => e.nome.toLowerCase() === row.emissor.toLowerCase());
      if (!emissor) errors.push(`Emissor "${row.emissor}" não encontrado`);

      // Pagamento
      const pagamento = row.pagamento || "No Vencimento";
      if (!PAGAMENTO_VALID.includes(pagamento)) errors.push(`Pagamento "${pagamento}" inválido`);

      // Preço de Emissão
      const puNum = parseNum(row.precoEmissao);
      if (puNum <= 0) errors.push("Preço de Emissão deve ser maior que zero");

      // Produto
      const produtoNomeRaw = row.produto || "CDB";
      const prod = cat ? prods.find(p =>
        p.categoria_id === cat.id && sigla(p.nome).toLowerCase() === produtoNomeRaw.toLowerCase()
      ) : null;
      if (cat && !prod) errors.push(`Produto "${produtoNomeRaw}" não encontrado na categoria`);

      // Build derived fields
      let modalidadeToSave = modalidade;
      let indexadorToSave: string | null = isPosFixado ? indexadorRaw : null;
      if (modalidade === "Pós Fixado" && indexadorRaw === "CDI+") {
        modalidadeToSave = "Mista";
        indexadorToSave = "CDI";
      }

      const nomeAtivo = (prod && emissor)
        ? buildNomeAtivo(prod.nome, emissor.nome, modalidadeToSave, String(taxaNum), vencISO || "", indexadorToSave || "")
        : "";

      return {
        ...row,
        errors,
        categoriaId: cat?.id || "",
        produtoId: prod?.id || "",
        instituicaoId: inst?.id || "",
        emissorId: emissor?.id || "",
        dataISO: dataISO || "",
        vencimentoISO: vencISO || "",
        taxaNum,
        valorNum,
        puNum,
        modalidadeToSave,
        indexadorToSave,
        nomeAtivo,
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
        // 1. Determine codigo_custodia (same logic as boleta)
        let codigoCustodia: number;
        let tipoFinal = "Aplicação Inicial";

        const { data: existing } = await supabase
          .from("movimentacoes")
          .select("codigo_custodia")
          .eq("nome_ativo", row.nomeAtivo)
          .not("codigo_custodia", "is", null)
          .limit(1);

        if (existing && existing.length > 0) {
          codigoCustodia = existing[0].codigo_custodia!;
          tipoFinal = "Aplicação";
        } else {
          const { data: maxRow } = await supabase
            .from("movimentacoes")
            .select("codigo_custodia")
            .not("codigo_custodia", "is", null)
            .order("codigo_custodia", { ascending: false })
            .limit(1);
          codigoCustodia = (maxRow?.[0]?.codigo_custodia ?? 99) + 1;
        }

        // 2. Calculate quantidade
        const quantidade = row.puNum > 0 ? row.valorNum / row.puNum : null;

        // 3. Build valor_extrato
        const valorExtrato = quantidade != null
          ? `R$ ${fmtBR(row.valorNum)} (R$ ${fmtBR(row.puNum)} x ${fmtBR(quantidade)})`
          : `R$ ${fmtBR(row.valorNum)}`;

        // 4. Insert movimentação
        const { error } = await supabase.from("movimentacoes").insert({
          categoria_id: row.categoriaId,
          tipo_movimentacao: tipoFinal,
          data: row.dataISO,
          produto_id: row.produtoId,
          valor: row.valorNum,
          preco_unitario: row.puNum,
          instituicao_id: row.instituicaoId,
          emissor_id: row.emissorId,
          modalidade: row.modalidadeToSave,
          taxa: row.taxaNum,
          pagamento: row.pagamento || "No Vencimento",
          vencimento: row.vencimentoISO,
          nome_ativo: row.nomeAtivo,
          codigo_custodia: codigoCustodia,
          indexador: row.indexadorToSave,
          quantidade,
          valor_extrato: valorExtrato,
          user_id: user.id,
          origem: "importacao_lote",
        });

        if (error) throw error;

        // 5. Get inserted id
        const { data: inserted } = await supabase
          .from("movimentacoes")
          .select("id")
          .eq("codigo_custodia", codigoCustodia)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);

        const insertedId = inserted?.[0]?.id || null;

        // 6. Full sync (same as boleta)
        await fullSyncAfterMovimentacao(insertedId, row.categoriaId, user.id, dataReferenciaISO);

        importResults.push({ rowIndex: row.rowIndex, status: "success", nomeAtivo: row.nomeAtivo });
      } catch (err: any) {
        importResults.push({
          rowIndex: row.rowIndex,
          status: "error",
          nomeAtivo: row.nomeAtivo,
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
    setRawRows([]);
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
            Importar Aplicações Iniciais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Idle */}
          {phase === "idle" && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Faça upload de um arquivo Excel (.xlsx) com os dados das aplicações iniciais.
                Cada linha será processada individualmente seguindo o mesmo fluxo da boleta manual.
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
                  {["Categoria", "Data da Transação", "Corretora", "Modalidade",
                    "Indexador", "Taxa", "Valor", "Vencimento", "Emissor",
                    "Pagamento", "Preço de Emissão", "Produto"].map(c => (
                    <span key={c} className="bg-muted px-2 py-0.5 rounded">{c}</span>
                  ))}
                </div>
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
                        <TableHead className="text-xs">Ativo</TableHead>
                        <TableHead className="text-xs">Data</TableHead>
                        <TableHead className="text-xs text-right">Valor</TableHead>
                        <TableHead className="text-xs text-right">PU</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validatedRows.filter(r => r.errors.length === 0).map(r => (
                        <TableRow key={r.rowIndex}>
                          <TableCell className="text-xs font-mono">{r.rowIndex}</TableCell>
                          <TableCell className="text-xs truncate max-w-[200px]">{r.nomeAtivo}</TableCell>
                          <TableCell className="text-xs">
                            {r.dataISO ? new Date(r.dataISO + "T00:00:00").toLocaleDateString("pt-BR") : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-right">R$ {fmtBR(r.valorNum)}</TableCell>
                          <TableCell className="text-xs text-right">R$ {fmtBR(r.puNum)}</TableCell>
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
