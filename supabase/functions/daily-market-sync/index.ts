import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Helpers ──────────────────────────────────────────────────────────

// ── Main handler ─────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const results: Record<string, string> = {};

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── 1. CDI ───────────────────────────────────────────────────────
    try {
      // Get max date in table
      const { data: maxCdi } = await supabase
        .from("historico_cdi")
        .select("data")
        .order("data", { ascending: false })
        .limit(1)
        .single();

      const startDate = maxCdi
        ? addDays(new Date(maxCdi.data + "T12:00:00"), 1)
        : new Date(2024, 0, 2);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      if (startDate <= yesterday) {
        const fmt = (d: Date) =>
          `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

        const bcbUrl = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.4389/dados?formato=json&dataInicial=${fmt(startDate)}&dataFinal=${fmt(yesterday)}`;
        console.log("Fetching CDI from BCB:", bcbUrl);

        const resp = await fetch(bcbUrl);
        if (!resp.ok) throw new Error(`BCB API error ${resp.status}`);

        const cdiData: { data: string; valor: string }[] = await resp.json();

        if (cdiData.length > 0) {
          const rows = cdiData.map((r) => {
            const [dd, mm, yyyy] = r.data.split("/");
            return {
              data: `${yyyy}-${mm}-${dd}`,
              taxa_anual: parseFloat(r.valor),
            };
          });

          const batchSize = 500;
          let inserted = 0;
          for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const { error } = await supabase
              .from("historico_cdi")
              .upsert(batch, { onConflict: "data" });
            if (error) throw new Error(`CDI insert: ${error.message}`);
            inserted += batch.length;
          }
          results.cdi = `Upserted ${inserted} CDI records`;
        } else {
          results.cdi = "No new CDI data";
        }
      } else {
        results.cdi = "CDI already up to date";
      }
    } catch (e) {
      results.cdi = `Error: ${e instanceof Error ? e.message : String(e)}`;
      console.error("CDI error:", e);
    }

    // ── 2. Ibovespa ──────────────────────────────────────────────────
    try {
      const { data: maxIbov } = await supabase
        .from("historico_ibovespa")
        .select("data")
        .order("data", { ascending: false })
        .limit(1)
        .single();

      const period1 = maxIbov
        ? Math.floor(new Date(maxIbov.data + "T12:00:00").getTime() / 1000)
        : 1704153600; // 02/01/2024

      const now = Math.floor(Date.now() / 1000);

      const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?period1=${period1}&period2=${now}&interval=1d`;
      console.log("Fetching Ibovespa from Yahoo Finance...");

      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Yahoo Finance error ${response.status}: ${text}`);
      }

      const data = await response.json();
      const result = data.chart?.result?.[0];

      if (!result) throw new Error("No data from Yahoo Finance");

      const timestamps = result.timestamp;
      const closes = result.indicators?.quote?.[0]?.close;

      if (timestamps && closes) {
        const rows: { data: string; pontos: number }[] = [];
        for (let i = 0; i < timestamps.length; i++) {
          if (closes[i] == null) continue;
          const date = new Date(timestamps[i] * 1000);
          rows.push({
            data: toISO(date),
            pontos: Math.round(closes[i] * 100) / 100,
          });
        }

        const batchSize = 500;
        let inserted = 0;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const { error } = await supabase
            .from("historico_ibovespa")
            .upsert(batch, { onConflict: "data" });
          if (error) throw new Error(`Ibovespa insert: ${error.message}`);
          inserted += batch.length;
        }
        results.ibovespa = `Upserted ${inserted} Ibovespa records`;
      } else {
        results.ibovespa = "No timestamp/close data";
      }
    } catch (e) {
      results.ibovespa = `Error: ${e instanceof Error ? e.message : String(e)}`;
      console.error("Ibovespa error:", e);
    }

    // ── 3. Selic ───────────────────────────────────────────────────────
    try {
      const { data: maxSelic } = await supabase
        .from("historico_selic")
        .select("data")
        .order("data", { ascending: false })
        .limit(1)
        .single();

      const startSelic = maxSelic
        ? addDays(new Date(maxSelic.data + "T12:00:00"), 1)
        : new Date(2024, 0, 2);

      const yesterdaySelic = new Date();
      yesterdaySelic.setDate(yesterdaySelic.getDate() - 1);

      if (startSelic <= yesterdaySelic) {
        const fmt = (d: Date) =>
          `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

        const bcbSelicUrl = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=${fmt(startSelic)}&dataFinal=${fmt(yesterdaySelic)}`;
        console.log("Fetching Selic from BCB:", bcbSelicUrl);

        const selicResp = await fetch(bcbSelicUrl);
        if (!selicResp.ok) throw new Error(`BCB Selic API error ${selicResp.status}`);

        const selicData: { data: string; valor: string }[] = await selicResp.json();

        if (selicData.length > 0) {
          const selicRows = selicData.map((r) => {
            const [dd, mm, yyyy] = r.data.split("/");
            return {
              data: `${yyyy}-${mm}-${dd}`,
              taxa_anual: parseFloat(r.valor),
            };
          });

          const batchSize = 500;
          let inserted = 0;
          for (let i = 0; i < selicRows.length; i += batchSize) {
            const batch = selicRows.slice(i, i + batchSize);
            const { error } = await supabase
              .from("historico_selic")
              .upsert(batch, { onConflict: "data" });
            if (error) throw new Error(`Selic insert: ${error.message}`);
            inserted += batch.length;
          }
          results.selic = `Upserted ${inserted} Selic records`;
        } else {
          results.selic = "No new Selic data";
        }
      } else {
        results.selic = "Selic already up to date";
      }
    } catch (e) {
      results.selic = `Error: ${e instanceof Error ? e.message : String(e)}`;
      console.error("Selic error:", e);
    }

    // ── 4. TR (Taxa Referencial) ─────────────────────────────────────
    try {
      const { data: maxTr } = await supabase
        .from("historico_tr")
        .select("data")
        .order("data", { ascending: false })
        .limit(1)
        .single();

      const startTr = maxTr
        ? addDays(new Date(maxTr.data + "T12:00:00"), 1)
        : new Date(2024, 0, 1);

      const yesterdayTr = new Date();
      yesterdayTr.setDate(yesterdayTr.getDate() - 1);

      if (startTr <= yesterdayTr) {
        const fmt = (d: Date) =>
          `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

        const bcbTrUrl = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.226/dados?formato=json&dataInicial=${fmt(startTr)}&dataFinal=${fmt(yesterdayTr)}`;
        console.log("Fetching TR from BCB:", bcbTrUrl);

        const trResp = await fetch(bcbTrUrl);
        if (!trResp.ok) throw new Error(`BCB TR API error ${trResp.status}`);

        const trData: { data: string; valor: string }[] = await trResp.json();

        if (trData.length > 0) {
          // Deduplicate by date (keep last value)
          const byDate = new Map<string, number>();
          for (const r of trData) {
            const [dd, mm, yyyy] = r.data.split("/");
            byDate.set(`${yyyy}-${mm}-${dd}`, parseFloat(r.valor));
          }

          const trRows = Array.from(byDate.entries()).map(([data, taxa_mensal]) => ({
            data,
            taxa_mensal,
          }));

          const batchSize = 500;
          let inserted = 0;
          for (let i = 0; i < trRows.length; i += batchSize) {
            const batch = trRows.slice(i, i + batchSize);
            const { error } = await supabase
              .from("historico_tr")
              .upsert(batch, { onConflict: "data" });
            if (error) throw new Error(`TR insert: ${error.message}`);
            inserted += batch.length;
          }
          results.tr = `Upserted ${inserted} TR records`;
        } else {
          results.tr = "No new TR data";
        }
      } else {
        results.tr = "TR already up to date";
      }
    } catch (e) {
      results.tr = `Error: ${e instanceof Error ? e.message : String(e)}`;
      console.error("TR error:", e);
    }

    // ── 5. Poupança Rendimento (Série 195) ─────────────────────────
    try {
      const { data: maxPoup } = await supabase
        .from("historico_poupanca_rendimento")
        .select("data")
        .order("data", { ascending: false })
        .limit(1)
        .single();

      const startPoup = maxPoup
        ? addDays(new Date(maxPoup.data + "T12:00:00"), 1)
        : new Date(2024, 0, 1);

      const yesterdayPoup = new Date();
      yesterdayPoup.setDate(yesterdayPoup.getDate() - 1);

      if (startPoup <= yesterdayPoup) {
        const fmt = (d: Date) =>
          `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

        const bcbPoupUrl = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.195/dados?formato=json&dataInicial=${fmt(startPoup)}&dataFinal=${fmt(yesterdayPoup)}`;
        console.log("Fetching Poupança rendimento from BCB:", bcbPoupUrl);

        const poupResp = await fetch(bcbPoupUrl);
        if (!poupResp.ok) throw new Error(`BCB Poupança API error ${poupResp.status}`);

        const poupData: { data: string; valor: string }[] = await poupResp.json();

        if (poupData.length > 0) {
          const byDate = new Map<string, number>();
          for (const r of poupData) {
            const [dd, mm, yyyy] = r.data.split("/");
            byDate.set(`${yyyy}-${mm}-${dd}`, parseFloat(r.valor));
          }

          const poupRows = Array.from(byDate.entries()).map(([data, rendimento_mensal]) => ({
            data,
            rendimento_mensal,
          }));

          const batchSize = 500;
          let inserted = 0;
          for (let i = 0; i < poupRows.length; i += batchSize) {
            const batch = poupRows.slice(i, i + batchSize);
            const { error } = await supabase
              .from("historico_poupanca_rendimento")
              .upsert(batch, { onConflict: "data" });
            if (error) throw new Error(`Poupança insert: ${error.message}`);
            inserted += batch.length;
          }
          results.poupanca_rendimento = `Upserted ${inserted} Poupança rendimento records`;
        } else {
          results.poupanca_rendimento = "No new Poupança rendimento data";
        }
      } else {
        results.poupanca_rendimento = "Poupança rendimento already up to date";
      }
    } catch (e) {
      results.poupanca_rendimento = `Error: ${e instanceof Error ? e.message : String(e)}`;
      console.error("Poupança rendimento error:", e);
    }

    // ── 6. Dólar PTAX Venda ──────────────────────────────────────────
    try {
      const { data: maxDolar } = await supabase
        .from("historico_dolar")
        .select("data")
        .order("data", { ascending: false })
        .limit(1)
        .single();

      const startDolar = maxDolar
        ? addDays(new Date(maxDolar.data + "T12:00:00"), 1)
        : new Date(2024, 0, 2);

      const yesterdayDolar = new Date();
      yesterdayDolar.setDate(yesterdayDolar.getDate() - 1);

      if (startDolar <= yesterdayDolar) {
        const fmtPtax = (d: Date) =>
          `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${d.getFullYear()}`;

        const ptaxUrl = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='${fmtPtax(startDolar)}'&@dataFinalCotacao='${fmtPtax(yesterdayDolar)}'&$top=10000&$format=json&$select=cotacaoVenda,dataHoraCotacao`;
        console.log("Fetching PTAX Venda from BCB OLINDA...");

        const ptaxResp = await fetch(ptaxUrl);
        if (!ptaxResp.ok) throw new Error(`BCB PTAX API error ${ptaxResp.status}`);

        const ptaxJson = await ptaxResp.json();
        const ptaxData = ptaxJson.value || [];

        if (ptaxData.length > 0) {
          // Group by date, keep last entry per day (closing)
          const byDate = new Map<string, number>();
          for (const r of ptaxData) {
            const dateStr = r.dataHoraCotacao.substring(0, 10); // "yyyy-MM-dd" from ISO
            // BCB returns "yyyy-MM-dd HH:mm:ss.SSS" format
            const isoDate = dateStr;
            byDate.set(isoDate, r.cotacaoVenda);
          }

          const dolarRows = Array.from(byDate.entries()).map(([data, cotacao_venda]) => ({
            data,
            cotacao_venda,
          }));

          const batchSize = 500;
          let inserted = 0;
          for (let i = 0; i < dolarRows.length; i += batchSize) {
            const batch = dolarRows.slice(i, i + batchSize);
            const { error } = await supabase
              .from("historico_dolar")
              .upsert(batch, { onConflict: "data" });
            if (error) throw new Error(`Dolar insert: ${error.message}`);
            inserted += batch.length;
          }
          results.dolar_ptax = `Upserted ${inserted} PTAX Venda records`;
        } else {
          results.dolar_ptax = "No new PTAX Venda data";
        }
      } else {
        results.dolar_ptax = "PTAX Venda already up to date";
      }
    } catch (e) {
      results.dolar_ptax = `Error: ${e instanceof Error ? e.message : String(e)}`;
      console.error("PTAX Venda error:", e);
    }

    // ── 6b. Euro PTAX Venda ──────────────────────────────────────────
    try {
      const { data: maxEuro } = await supabase
        .from("historico_euro")
        .select("data")
        .order("data", { ascending: false })
        .limit(1)
        .single();

      const startEuro = maxEuro
        ? addDays(new Date(maxEuro.data + "T12:00:00"), 1)
        : new Date(2024, 0, 2);

      const yesterdayEuro = new Date();
      yesterdayEuro.setDate(yesterdayEuro.getDate() - 1);

      if (startEuro <= yesterdayEuro) {
        const fmtPtax = (d: Date) =>
          `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${d.getFullYear()}`;

        const euroUrl = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@moeda='EUR'&@dataInicial='${fmtPtax(startEuro)}'&@dataFinalCotacao='${fmtPtax(yesterdayEuro)}'&$top=10000&$format=json&$select=cotacaoVenda,dataHoraCotacao`;
        console.log("Fetching Euro PTAX Venda from BCB OLINDA...");

        const euroResp = await fetch(euroUrl);
        if (!euroResp.ok) throw new Error(`BCB Euro PTAX API error ${euroResp.status}`);

        const euroJson = await euroResp.json();
        const euroData = euroJson.value || [];

        if (euroData.length > 0) {
          const byDate = new Map<string, number>();
          for (const r of euroData) {
            const dateStr = r.dataHoraCotacao.substring(0, 10);
            byDate.set(dateStr, r.cotacaoVenda);
          }

          const euroRows = Array.from(byDate.entries()).map(([data, cotacao_venda]) => ({
            data,
            cotacao_venda,
          }));

          const batchSize = 500;
          let inserted = 0;
          for (let i = 0; i < euroRows.length; i += batchSize) {
            const batch = euroRows.slice(i, i + batchSize);
            const { error } = await supabase
              .from("historico_euro")
              .upsert(batch, { onConflict: "data" });
            if (error) throw new Error(`Euro insert: ${error.message}`);
            inserted += batch.length;
          }
          results.euro_ptax = `Upserted ${inserted} Euro PTAX Venda records`;
        } else {
          results.euro_ptax = "No new Euro PTAX Venda data";
        }
      } else {
        results.euro_ptax = "Euro PTAX Venda already up to date";
      }
    } catch (e) {
      results.euro_ptax = `Error: ${e instanceof Error ? e.message : String(e)}`;
      console.error("Euro PTAX Venda error:", e);
    }

    // ── 7. IPCA (Série SGS 433 — variação mensal) ────────────────────
    try {
      const { data: maxIpca } = await supabase
        .from("historico_ipca")
        .select("data_referencia")
        .order("data_referencia", { ascending: false })
        .limit(1)
        .single();

      // SGS 433 returns monthly data; start from last + 1 month or 2020-01
      const startIpca = maxIpca
        ? addDays(new Date(maxIpca.data_referencia + "T12:00:00"), 32) // next month
        : new Date(2020, 0, 1);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      if (startIpca <= yesterday) {
        const fmt = (d: Date) =>
          `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

        const bcbIpcaUrl = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=${fmt(startIpca)}&dataFinal=${fmt(yesterday)}`;
        console.log("Fetching IPCA from BCB SGS 433:", bcbIpcaUrl);

        const ipcaResp = await fetch(bcbIpcaUrl);
        if (!ipcaResp.ok) throw new Error(`BCB IPCA API error ${ipcaResp.status}`);

        const ipcaData: { data: string; valor: string }[] = await ipcaResp.json();

        if (ipcaData.length > 0) {
          const ipcaRows = ipcaData.map((r) => {
            const [dd, mm, yyyy] = r.data.split("/");
            const dataRef = `${yyyy}-${mm}-${dd}`;
            // competencia = first day of the month
            const competencia = `${yyyy}-${mm}-01`;
            const variacao = parseFloat(r.valor);
            // data_publicacao ≈ competencia + 1 month + 10 days (IBGE publication)
            const compDate = new Date(parseInt(yyyy), parseInt(mm) - 1, 1);
            compDate.setMonth(compDate.getMonth() + 1);
            compDate.setDate(compDate.getDate() + 10);
            const dataPub = `${compDate.getFullYear()}-${String(compDate.getMonth() + 1).padStart(2, "0")}-${String(compDate.getDate()).padStart(2, "0")}`;
            return {
              data_referencia: dataRef,
              competencia,
              variacao_mensal: variacao,
              fator_mensal: 1 + variacao / 100,
              data_publicacao: dataPub,
            };
          });

          const batchSize = 500;
          let inserted = 0;
          for (let i = 0; i < ipcaRows.length; i += batchSize) {
            const batch = ipcaRows.slice(i, i + batchSize);
            const { error } = await supabase
              .from("historico_ipca")
              .upsert(batch, { onConflict: "data_referencia" });
            if (error) throw new Error(`IPCA insert: ${error.message}`);
            inserted += batch.length;
          }
          results.ipca = `Upserted ${inserted} IPCA records`;
        } else {
          results.ipca = "No new IPCA data";
        }
      } else {
        results.ipca = "IPCA already up to date";
      }
    } catch (e) {
      results.ipca = `Error: ${e instanceof Error ? e.message : String(e)}`;
      console.error("IPCA error:", e);
    }


    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Fatal error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        results,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
