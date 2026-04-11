/**
 * Camada compartilhada de cache para dados históricos e auxiliares.
 * Evita que cada página faça sua própria carga isolada dos mesmos dados.
 * 
 * O cache é invalidado quando appliedVersion muda (nova transação ou nova data de referência).
 */
import { supabase } from "@/integrations/supabase/client";

interface CacheEntry<T> {
  version: number;
  userId: string;
  data: T;
  rangeKey?: string; // e.g. "2024-01-01|2025-12-31"
}

// ── Types ──
export interface CalendarioRecord {
  data: string;
  dia_util: boolean;
}

export interface CdiRecord {
  data: string;
  taxa_anual: number;
}

export interface SelicRecord {
  data: string;
  taxa_anual: number;
}

export interface TrRecord {
  data: string;
  taxa_mensal: number;
}

export interface PoupancaRendimentoRecord {
  data: string;
  rendimento_mensal: number;
}

export interface CustodiaRecord {
  id: string;
  codigo_custodia: number;
  nome: string | null;
  data_inicio: string;
  data_calculo: string | null;
  taxa: number | null;
  modalidade: string | null;
  multiplicador: string | null;
  preco_unitario: number | null;
  categoria_id: string;
  categoria_nome: string;
  produto_id: string;
  produto_nome: string;
  resgate_total: string | null;
  pagamento: string | null;
  vencimento: string | null;
  indexador: string | null;
  data_limite: string | null;
  valor_investido: number;
  instituicao_id: string | null;
  instituicao_nome: string | null;
  emissor_id: string | null;
  emissor_nome: string | null;
  estrategia: string | null;
  alocacao_patrimonial: string | null;
  quantidade: number | null;
  sigla_tesouro: string | null;
  status_variavel: string | null;
}

export interface MovimentacaoRecord {
  data: string;
  tipo_movimentacao: string;
  valor: number;
  codigo_custodia: number;
}

// ── Cache storage ──

let _calendarioCache: CacheEntry<CalendarioRecord[]> | null = null;
let _cdiCache: CacheEntry<CdiRecord[]> | null = null;
let _selicCache: CacheEntry<SelicRecord[]> | null = null;
let _trCache: CacheEntry<TrRecord[]> | null = null;
let _poupRendCache: CacheEntry<PoupancaRendimentoRecord[]> | null = null;
let _custodiaCache: CacheEntry<CustodiaRecord[]> | null = null;
let _movimentacoesCache: CacheEntry<MovimentacaoRecord[]> | null = null;

// Pre-built Maps for O(1) lookups
let _cdiMap: Map<string, number> | null = null;
let _cdiMapVersion: number = -1;
let _selicMap: Map<string, number> | null = null;
let _selicMapVersion: number = -1;
let _movByCodigoMap: Map<number, MovimentacaoRecord[]> | null = null;
let _movByCodigoVersion: number = -1;

/** Invalidate all caches (call when appliedVersion changes) */
export function invalidateAllCaches() {
  _calendarioCache = null;
  _cdiCache = null;
  _selicCache = null;
  _trCache = null;
  _poupRendCache = null;
  _custodiaCache = null;
  _movimentacoesCache = null;
  _cdiMap = null;
  _cdiMapVersion = -1;
  _selicMap = null;
  _selicMapVersion = -1;
  _movByCodigoMap = null;
  _movByCodigoVersion = -1;
}

function isCacheValid<T>(cache: CacheEntry<T> | null, version: number, userId: string, rangeKey?: string): cache is CacheEntry<T> {
  if (!cache) return false;
  if (cache.version !== version || cache.userId !== userId) return false;
  if (rangeKey && cache.rangeKey !== rangeKey) return false;
  return true;
}

// ── Fetch functions ──

export async function fetchCalendario(
  userId: string,
  version: number,
  dataInicio?: string,
  dataFim?: string
): Promise<CalendarioRecord[]> {
  const rangeKey = `${dataInicio || ""}|${dataFim || ""}`;
  if (isCacheValid(_calendarioCache, version, userId, rangeKey)) {
    return _calendarioCache.data;
  }

  let query = supabase.from("calendario_dias_uteis").select("data, dia_util");
  if (dataInicio) query = query.gte("data", dataInicio);
  if (dataFim) query = query.lte("data", dataFim);
  query = query.order("data");

  const { data } = await query;
  const result = (data || []) as CalendarioRecord[];
  _calendarioCache = { version, userId, data: result, rangeKey };
  return result;
}

export async function fetchCdi(
  userId: string,
  version: number,
  dataInicio?: string,
  dataFim?: string
): Promise<CdiRecord[]> {
  const rangeKey = `${dataInicio || ""}|${dataFim || ""}`;
  if (isCacheValid(_cdiCache, version, userId, rangeKey)) {
    return _cdiCache.data;
  }

  let query = supabase.from("historico_cdi").select("data, taxa_anual");
  if (dataInicio) query = query.gte("data", dataInicio);
  if (dataFim) query = query.lte("data", dataFim);
  query = query.order("data");

  const { data } = await query;
  const result = (data || []).map((r: any) => ({ data: r.data, taxa_anual: Number(r.taxa_anual) }));
  _cdiCache = { version, userId, data: result, rangeKey };
  return result;
}

export async function fetchSelic(
  userId: string,
  version: number,
  dataInicio?: string,
  dataFim?: string
): Promise<SelicRecord[]> {
  const rangeKey = `${dataInicio || ""}|${dataFim || ""}`;
  if (isCacheValid(_selicCache, version, userId, rangeKey)) {
    return _selicCache.data;
  }

  let query = supabase.from("historico_selic").select("data, taxa_anual");
  if (dataInicio) query = query.gte("data", dataInicio);
  if (dataFim) query = query.lte("data", dataFim);
  query = query.order("data");

  const { data } = await query;
  const result = (data || []).map((r: any) => ({ data: r.data, taxa_anual: Number(r.taxa_anual) }));
  _selicCache = { version, userId, data: result, rangeKey };
  return result;
}

export async function fetchTr(
  userId: string,
  version: number,
  dataInicio?: string,
  dataFim?: string
): Promise<TrRecord[]> {
  const rangeKey = `${dataInicio || ""}|${dataFim || ""}`;
  if (isCacheValid(_trCache, version, userId, rangeKey)) {
    return _trCache.data;
  }

  let query = supabase.from("historico_tr").select("data, taxa_mensal");
  if (dataInicio) query = query.gte("data", dataInicio);
  if (dataFim) query = query.lte("data", dataFim);
  query = query.order("data");

  const { data } = await query;
  const result = (data || []).map((r: any) => ({ data: r.data, taxa_mensal: Number(r.taxa_mensal) }));
  _trCache = { version, userId, data: result, rangeKey };
  return result;
}

export async function fetchPoupancaRendimento(
  userId: string,
  version: number,
  dataInicio?: string,
  dataFim?: string
): Promise<PoupancaRendimentoRecord[]> {
  const rangeKey = `${dataInicio || ""}|${dataFim || ""}`;
  if (isCacheValid(_poupRendCache, version, userId, rangeKey)) {
    return _poupRendCache.data;
  }

  let query = supabase.from("historico_poupanca_rendimento").select("data, rendimento_mensal");
  if (dataInicio) query = query.gte("data", dataInicio);
  if (dataFim) query = query.lte("data", dataFim);
  query = query.order("data");

  const { data } = await query;
  const result = (data || []).map((r: any) => ({ data: r.data, rendimento_mensal: Number(r.rendimento_mensal) }));
  _poupRendCache = { version, userId, data: result, rangeKey };
  return result;
}

export async function fetchCustodia(
  userId: string,
  version: number
): Promise<CustodiaRecord[]> {
  if (isCacheValid(_custodiaCache, version, userId)) {
    return _custodiaCache.data;
  }

  const { data } = await supabase
    .from("custodia")
    .select("id, codigo_custodia, nome, data_inicio, data_calculo, taxa, modalidade, multiplicador, preco_unitario, resgate_total, pagamento, vencimento, indexador, data_limite, valor_investido, categoria_id, produto_id, instituicao_id, emissor_id, estrategia, alocacao_patrimonial, quantidade, sigla_tesouro, status_variavel, categorias(nome), produtos(nome), instituicoes(nome), emissores(nome)")
    .eq("user_id", userId);

  const result: CustodiaRecord[] = (data || []).map((r: any) => ({
    id: r.id,
    codigo_custodia: r.codigo_custodia,
    nome: r.nome,
    data_inicio: r.data_inicio,
    data_calculo: r.data_calculo,
    taxa: r.taxa,
    modalidade: r.modalidade,
    multiplicador: r.multiplicador,
    preco_unitario: r.preco_unitario,
    categoria_id: r.categoria_id,
    categoria_nome: r.categorias?.nome || "",
    produto_id: r.produto_id,
    produto_nome: r.produtos?.nome || "",
    resgate_total: r.resgate_total,
    pagamento: r.pagamento,
    vencimento: r.vencimento,
    indexador: r.indexador,
    data_limite: r.data_limite,
    valor_investido: r.valor_investido,
    instituicao_id: r.instituicao_id,
    instituicao_nome: r.instituicoes?.nome || null,
    emissor_id: r.emissor_id,
    emissor_nome: r.emissores?.nome || null,
    estrategia: r.estrategia,
    alocacao_patrimonial: r.alocacao_patrimonial,
    quantidade: r.quantidade,
    sigla_tesouro: r.sigla_tesouro,
    status_variavel: r.status_variavel,
  }));

  _custodiaCache = { version, userId, data: result };
  return result;
}

export async function fetchMovimentacoes(
  userId: string,
  version: number
): Promise<MovimentacaoRecord[]> {
  if (isCacheValid(_movimentacoesCache, version, userId)) {
    return _movimentacoesCache.data;
  }

  const { data } = await supabase
    .from("movimentacoes")
    .select("data, tipo_movimentacao, valor, codigo_custodia")
    .eq("user_id", userId)
    .order("data");

  const result: MovimentacaoRecord[] = (data || []).map((r: any) => ({
    data: r.data,
    tipo_movimentacao: r.tipo_movimentacao,
    valor: Number(r.valor),
    codigo_custodia: r.codigo_custodia as number,
  }));

  _movimentacoesCache = { version, userId, data: result };
  return result;
}

// ── Pre-built lookup helpers ──

export function getCdiMap(cdiRecords: CdiRecord[], version: number): Map<string, number> {
  if (_cdiMap && _cdiMapVersion === version) return _cdiMap;
  _cdiMap = new Map<string, number>();
  for (const c of cdiRecords) _cdiMap.set(c.data, c.taxa_anual);
  _cdiMapVersion = version;
  return _cdiMap;
}

export function getSelicMap(selicRecords: SelicRecord[], version: number): Map<string, number> {
  if (_selicMap && _selicMapVersion === version) return _selicMap;
  _selicMap = new Map<string, number>();
  for (const s of selicRecords) _selicMap.set(s.data, s.taxa_anual);
  _selicMapVersion = version;
  return _selicMap;
}

export function getMovByCodigoMap(movRecords: MovimentacaoRecord[], version: number): Map<number, MovimentacaoRecord[]> {
  if (_movByCodigoMap && _movByCodigoVersion === version) return _movByCodigoMap;
  _movByCodigoMap = new Map<number, MovimentacaoRecord[]>();
  for (const m of movRecords) {
    if (!_movByCodigoMap.has(m.codigo_custodia)) _movByCodigoMap.set(m.codigo_custodia, []);
    _movByCodigoMap.get(m.codigo_custodia)!.push(m);
  }
  _movByCodigoVersion = version;
  return _movByCodigoMap;
}

// ── Utility ──

export function getDateMinus(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
