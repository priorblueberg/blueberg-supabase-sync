export interface CustodiaRowForBoleta {
  id: string;
  codigo_custodia: number;
  data_inicio: string;
  tipo_movimentacao: string;
  modalidade: string | null;
  indexador: string | null;
  taxa: number | null;
  valor_investido: number;
  preco_unitario: number | null;
  quantidade: number | null;
  vencimento: string | null;
  pagamento: string | null;
  nome: string | null;
  produto: string;
  produto_id: string;
  instituicao: string | null;
  instituicao_id: string | null;
  emissor: string | null;
  emissor_id: string | null;
  categoria: string;
  categoria_id: string;
  resgate_total: string | null;
}
