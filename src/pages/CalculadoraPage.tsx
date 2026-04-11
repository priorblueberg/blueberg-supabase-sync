import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useDataReferencia } from "@/contexts/DataReferenciaContext";
import { calcularRendaFixaDiario, DailyRow } from "@/lib/rendaFixaEngine";
import { fetchIpcaRecords, fetchIpcaRecordsBatch } from "@/lib/ipcaHelper";
import { calcularCarteiraRendaFixa, CarteiraRFRow } from "@/lib/carteiraRendaFixaEngine";
import { calcularPoupancaDiario, buildPoupancaLotesFromMovs } from "@/lib/poupancaEngine";
import {
  fetchCalendario, fetchCdi, fetchSelic, fetchTr, fetchPoupancaRendimento,
  fetchCustodia, fetchMovimentacoes, getCdiMap, getMovByCodigoMap, getDateMinus,
  type CustodiaRecord,
} from "@/lib/dataCache";
import {
  getCachedRFResult, cacheRFResult, buildMovsHash,
  getCachedPoupancaResult, cachePoupancaResult,
} from "@/lib/engineCache";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import CalculadoraTable from "@/components/CalculadoraTable";
import CalculadoraCarteiraTable from "@/components/CalculadoraCarteiraTable";
import { exportIndividualToExcel, exportCarteiraToExcel } from "@/lib/exportCalculadora";
import { supabase } from "@/integrations/supabase/client";

const CARTEIRA_RF_ID = "__carteira_rf__";

export default function CalculadoraPage() {
  const { user } = useAuth();
  const { appliedVersion } = useDataReferencia();
  const [products, setProducts] = useState<CustodiaRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [rows, setRows] = useState<DailyRow[]>([]);
  const [carteiraRows, setCarteiraRows] = useState<CarteiraRFRow[]>([]);
  const [loading, setLoading] = useState(false);
  const calcVersionRef = useRef(0);

  // Load custodia products from cache
  useEffect(() => {
    if (!user) return;
    fetchCustodia(user.id, appliedVersion).then(setProducts);
  }, [user, appliedVersion]);

  // Calculate when product is selected
  useEffect(() => {
    if (!selectedId || !user) return;

    if (selectedId === CARTEIRA_RF_ID) {
      calculateCarteira();
      return;
    }

    const product = products.find((p) => p.id === selectedId);
    if (!product) return;

    const currentVersion = ++calcVersionRef.current;

    (async () => {
      setLoading(true);
      setCarteiraRows([]);
      try {
        const isPoupanca = product.modalidade === "Poupança";
        // Compute for the max possible range (vencimento/resgate), not just dataCalculo
        const dataFim = product.resgate_total || product.vencimento || product.data_calculo || "2099-12-31";
        const dateStart = getDateMinus(product.data_inicio, 5);

        if (isPoupanca) {
          // Check poupanca cache first
          const allMovs = await fetchMovimentacoes(user.id, appliedVersion);
          const productMovs = allMovs
            .filter(m => m.codigo_custodia === product.codigo_custodia)
            .map(m => ({ data: m.data, tipo_movimentacao: m.tipo_movimentacao, valor: m.valor }));
          const movsHash = buildMovsHash(productMovs);

          const cached = getCachedPoupancaResult(product.codigo_custodia, dataFim, movsHash);
          if (cached) {
            if (currentVersion !== calcVersionRef.current) return;
            setRows(cached);
          } else {
            const [calendario, selicRecords, trRecords, poupRendRecords] = await Promise.all([
              fetchCalendario(user.id, appliedVersion, dateStart, dataFim),
              fetchSelic(user.id, appliedVersion, dateStart, dataFim),
              fetchTr(user.id, appliedVersion, dateStart, dataFim),
              fetchPoupancaRendimento(user.id, appliedVersion, dateStart, dataFim),
            ]);

            if (currentVersion !== calcVersionRef.current) return;

            const lotesForEngine = buildPoupancaLotesFromMovs(productMovs);
            const result = calcularPoupancaDiario({
              dataInicio: product.data_inicio,
              dataCalculo: dataFim,
              calendario,
              movimentacoes: productMovs,
              lotes: lotesForEngine,
              selicRecords,
              trRecords,
              poupancaRendimentoRecords: poupRendRecords,
              dataResgateTotal: product.resgate_total,
            });

            cachePoupancaResult(product.codigo_custodia, result, movsHash);
            if (currentVersion !== calcVersionRef.current) return;
            setRows(result);
          }
        } else {
          // RF — use engine cache
          const allMovs = await fetchMovimentacoes(user.id, appliedVersion);
          const productMovs = allMovs
            .filter(m => m.codigo_custodia === product.codigo_custodia)
            .map(m => ({ data: m.data, tipo_movimentacao: m.tipo_movimentacao, valor: m.valor }));
          const movsHash = buildMovsHash(productMovs);

          const cacheParams = {
            dataInicio: product.data_inicio,
            taxa: product.taxa || 0,
            modalidade: product.modalidade || "",
            puInicial: product.preco_unitario || 1000,
            pagamento: product.pagamento,
            vencimento: product.vencimento,
            indexador: product.indexador,
            dataResgateTotal: product.resgate_total,
            dataLimite: product.data_limite,
            movsHash,
          };

          const cached = getCachedRFResult(product.codigo_custodia, dataFim, cacheParams);
          if (cached) {
            if (currentVersion !== calcVersionRef.current) return;
            setRows(cached);
          } else {
            const [calendario, cdiRecords] = await Promise.all([
              fetchCalendario(user.id, appliedVersion, dateStart, dataFim),
              fetchCdi(user.id, appliedVersion, dateStart, dataFim),
            ]);

            if (currentVersion !== calcVersionRef.current) return;

            const ipcaData = await fetchIpcaRecords(product.indexador, product.data_inicio, dataFim);
            if (currentVersion !== calcVersionRef.current) return;

            const result = calcularRendaFixaDiario({
              dataInicio: product.data_inicio,
              dataCalculo: dataFim,
              taxa: product.taxa || 0,
              modalidade: product.modalidade || "",
              puInicial: product.preco_unitario || 1000,
              calendario,
              movimentacoes: productMovs,
              dataResgateTotal: product.resgate_total,
              pagamento: product.pagamento,
              vencimento: product.vencimento,
              indexador: product.indexador,
              cdiRecords,
              dataLimite: product.data_limite,
              ipcaOficialRecords: ipcaData?.oficial,
              ipcaProjecaoRecords: ipcaData?.projecao,
            });

            cacheRFResult(product.codigo_custodia, result, cacheParams);
            if (currentVersion !== calcVersionRef.current) return;
            setRows(result);
          }
        }
      } catch (err) {
        console.error("Erro ao calcular:", err);
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, appliedVersion]);

  const calculateCarteira = useCallback(async () => {
    if (!user) return;
    const currentVersion = ++calcVersionRef.current;
    setLoading(true);
    setRows([]);
    try {
      const { data: carteiraData } = await supabase
        .from("controle_de_carteiras")
        .select("data_inicio, data_calculo, data_limite, resgate_total")
        .eq("nome_carteira", "Renda Fixa")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!carteiraData?.data_inicio || !carteiraData?.data_calculo) {
        setCarteiraRows([]);
        setLoading(false);
        return;
      }

      const dataInicio = carteiraData.data_inicio;
      const dataCalculo = carteiraData.data_calculo;

      const rfProducts = products.filter(p => p.categoria_nome === "Renda Fixa");
      if (rfProducts.length === 0) { setCarteiraRows([]); setLoading(false); return; }

      const maxEndDate = rfProducts.reduce((max, p) => {
        const end = p.resgate_total || p.vencimento || dataCalculo;
        return end > max ? end : max;
      }, dataCalculo);

      const [calendario, cdiRecords, allMovs] = await Promise.all([
        fetchCalendario(user.id, appliedVersion, getDateMinus(dataInicio, 5), maxEndDate),
        fetchCdi(user.id, appliedVersion, getDateMinus(dataInicio, 5), dataCalculo),
        fetchMovimentacoes(user.id, appliedVersion),
      ]);

      if (currentVersion !== calcVersionRef.current) return;

      const cdiMap = getCdiMap(cdiRecords, appliedVersion);
      const movByCodigoMap = getMovByCodigoMap(allMovs, appliedVersion);

      const ipcaData = await fetchIpcaRecordsBatch(rfProducts, dataCalculo);
      if (currentVersion !== calcVersionRef.current) return;

      const allProductRows = rfProducts.map((product) => {
        const dataFim = product.resgate_total || product.vencimento || dataCalculo;
        const productMovs = (movByCodigoMap.get(product.codigo_custodia) || [])
          .map(m => ({ data: m.data, tipo_movimentacao: m.tipo_movimentacao, valor: m.valor }));
        return calcularRendaFixaDiario({
          dataInicio: product.data_inicio,
          dataCalculo: dataFim > dataCalculo ? dataCalculo : dataFim,
          taxa: product.taxa || 0,
          modalidade: product.modalidade || "",
          puInicial: product.preco_unitario || 1000,
          calendario,
          movimentacoes: productMovs,
          dataResgateTotal: product.resgate_total,
          pagamento: product.pagamento,
          vencimento: product.vencimento,
          indexador: product.indexador,
          cdiRecords,
          dataLimite: product.data_limite,
          precomputedCdiMap: cdiMap,
          calendarioSorted: true,
          ipcaOficialRecords: product.indexador === "IPCA" ? ipcaData?.oficial : undefined,
          ipcaProjecaoRecords: product.indexador === "IPCA" ? ipcaData?.projecao : undefined,
        });
      });

      if (currentVersion !== calcVersionRef.current) return;

      const result = calcularCarteiraRendaFixa({
        productRows: allProductRows,
        calendario,
        dataInicio,
        dataCalculo,
      });

      setCarteiraRows(result);
    } catch (err) {
      console.error("Erro ao calcular carteira RF:", err);
    } finally {
      setLoading(false);
    }
  }, [user, products, appliedVersion]);

  const selectedProduct = useMemo(
    () => selectedId !== CARTEIRA_RF_ID ? products.find((p) => p.id === selectedId) : null,
    [selectedId, products]
  );
  const isCarteira = selectedId === CARTEIRA_RF_ID;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Calculadora</h1>

      <div className="max-w-md">
        <label className="mb-1 block text-sm font-medium text-muted-foreground">
          Selecione o produto da custódia
        </label>
        <Select value={selectedId} onValueChange={setSelectedId}>
          <SelectTrigger>
            <SelectValue placeholder="Escolha um produto..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CARTEIRA_RF_ID} className="font-semibold text-primary">
              📊 Carteira Renda Fixa (Consolidado)
            </SelectItem>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.nome || p.produto_nome} — {p.categoria_nome}{" "}
                {p.modalidade ? `(${p.modalidade})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedProduct && (
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {selectedProduct.nome || selectedProduct.produto_nome}
          </span>{" "}
          | Taxa: {selectedProduct.taxa != null ? `${selectedProduct.taxa.toFixed(2)}%` : "—"} |
          Modalidade: {selectedProduct.modalidade || "—"} | Multiplicador:{" "}
          {selectedProduct.multiplicador || "—"} | Pagamento:{" "}
          {selectedProduct.pagamento || "—"}
        </div>
      )}

      {isCarteira && !loading && (
        <div className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Carteira Renda Fixa</span>{" "}
          | Visão consolidada de todos os produtos de Renda Fixa
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground">Calculando...</p>}

      {!loading && selectedId && ((rows.length > 0 && !isCarteira) || (carteiraRows.length > 0 && isCarteira)) && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (isCarteira) {
              exportCarteiraToExcel(carteiraRows);
            } else {
              const nome = selectedProduct?.nome || selectedProduct?.produto_nome || "Ativo";
              exportIndividualToExcel(rows, nome);
            }
          }}
        >
          <Download className="mr-2 h-4 w-4" />
          Exportar Excel
        </Button>
      )}

      {!loading && !isCarteira && rows.length > 0 && (
        <CalculadoraTable
          rows={rows}
          pagamento={selectedProduct?.pagamento}
          dataResgateTotal={selectedProduct?.resgate_total}
        />
      )}

      {!loading && isCarteira && carteiraRows.length > 0 && <CalculadoraCarteiraTable rows={carteiraRows} />}

      {!loading && selectedId && !isCarteira && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum dado encontrado para o produto selecionado.</p>
      )}

      {!loading && isCarteira && carteiraRows.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum dado encontrado para a Carteira de Renda Fixa.</p>
      )}
    </div>
  );
}
