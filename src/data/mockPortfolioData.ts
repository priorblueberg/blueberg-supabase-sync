/* ── Mock data per portfolio slug ── */

export interface PortfolioMetrics {
  patrimonio: number;
  ganho: number;
  rentabilidade: number;
  cdi: number;
  sobreCdi: number;
}

export interface MonthlyRow {
  mes: string;
  patrimonio: number;
  ganho: number;
  rent: number;
  cdi: number;
  sobreCdi: number;

  /** Ano de referência (ex: 2026). Opcional para manter compatibilidade com mocks. */
  ano?: number;
  /** Índice do mês (0=JAN ... 11=DEZ). Opcional para manter compatibilidade com mocks. */
  mesIndex?: number;
}


export interface AssetRow {
  nome: string;
  patrimonio: number;
  ganho: number;
  rentabilidade: number;
  sobreCdi: number;
  pesoCarteira: number;
  status: "Ativo" | "Em Resgate" | "Liquidado";
  dataRef: string;
}

export interface AssetDetailData {
  metrics: PortfolioMetrics;
  monthly: MonthlyRow[];
}

export interface PortfolioData {
  metrics: PortfolioMetrics;
  monthly: MonthlyRow[];
  assets: AssetRow[];
  /** Per-asset detail data keyed by asset name */
  assetDetails: Record<string, AssetDetailData>;
}

const MONTHS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

/* ── Helper: generate monthly data for an individual asset ── */
function generateAssetMonthly(
  basePatrimonio: number,
  totalGanho: number,
  totalRent: number,
): MonthlyRow[] {
  const cdiMonthly = [1.08, 0.99, 1.12, 1.06, 1.12, 1.07, 1.07, 1.14, 0.97, 1.00, 0.93, 1.12];
  const weights = [0.08, 0.10, 0.07, 0.09, 0.06, 0.10, 0.05, 0.11, 0.08, 0.12, 0.06, 0.08];
  let pat = basePatrimonio - totalGanho;
  return MONTHS.map((mes, i) => {
    const ganho = Math.round(totalGanho * weights[i]);
    pat += ganho;
    const rent = +(totalRent * weights[i] / 0.08).toFixed(2);
    const cdi = cdiMonthly[i];
    const sobreCdi = cdi !== 0 ? +((rent / cdi) * 100).toFixed(2) : 0;
    return { mes, patrimonio: Math.round(pat), ganho, rent, cdi, sobreCdi };
  });
}

function buildAssetDetail(asset: AssetRow): AssetDetailData {
  const monthly = generateAssetMonthly(asset.patrimonio, asset.ganho, asset.rentabilidade);
  return {
    metrics: {
      patrimonio: asset.patrimonio,
      ganho: asset.ganho,
      rentabilidade: asset.rentabilidade,
      cdi: 13.00,
      sobreCdi: asset.sobreCdi,
    },
    monthly,
  };
}

function buildAssetDetailsMap(assets: AssetRow[]): Record<string, AssetDetailData> {
  const map: Record<string, AssetDetailData> = {};
  for (const a of assets) {
    map[a.nome] = buildAssetDetail(a);
  }
  return map;
}

/* ─── Fundos de Investimentos ─── */
const fundosMonthly: MonthlyRow[] = [
  { mes: "JAN", patrimonio: 505000, ganho: 4200, rent: 0.84, cdi: 1.08, sobreCdi: 77.78 },
  { mes: "FEV", patrimonio: 511500, ganho: 6500, rent: 1.29, cdi: 0.99, sobreCdi: 130.30 },
  { mes: "MAR", patrimonio: 515800, ganho: 4300, rent: 0.84, cdi: 1.12, sobreCdi: 75.00 },
  { mes: "ABR", patrimonio: 522400, ganho: 6600, rent: 1.28, cdi: 1.06, sobreCdi: 120.75 },
  { mes: "MAI", patrimonio: 526100, ganho: 3700, rent: 0.71, cdi: 1.12, sobreCdi: 63.39 },
  { mes: "JUN", patrimonio: 531900, ganho: 5800, rent: 1.10, cdi: 1.07, sobreCdi: 102.80 },
  { mes: "JUL", patrimonio: 534200, ganho: 2300, rent: 0.43, cdi: 1.07, sobreCdi: 40.19 },
  { mes: "AGO", patrimonio: 539800, ganho: 5600, rent: 1.05, cdi: 1.14, sobreCdi: 92.11 },
  { mes: "SET", patrimonio: 544100, ganho: 4300, rent: 0.80, cdi: 0.97, sobreCdi: 82.47 },
  { mes: "OUT", patrimonio: 535200, ganho: -8900, rent: -1.64, cdi: 1.00, sobreCdi: -164.00 },
  { mes: "NOV", patrimonio: 537800, ganho: 2600, rent: 0.49, cdi: 0.93, sobreCdi: 52.69 },
  { mes: "DEZ", patrimonio: 542500, ganho: 4700, rent: 0.87, cdi: 1.12, sobreCdi: 77.68 },
];

const fundosAssets: AssetRow[] = [
  { nome: "Alaska Black FIC FIA", patrimonio: 125000, ganho: 8750, rentabilidade: 7.53, sobreCdi: 57.92, pesoCarteira: 23.04, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "BTG Pactual Yield DI FI", patrimonio: 98000, ganho: 12740, rentabilidade: 14.94, sobreCdi: 114.92, pesoCarteira: 18.06, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "Verde AM Long Short FIC FIM", patrimonio: 87500, ganho: 6125, rentabilidade: 7.52, sobreCdi: 57.85, pesoCarteira: 16.13, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "Kinea Rendimentos RF FI", patrimonio: 76000, ganho: 9880, rentabilidade: 14.93, sobreCdi: 114.85, pesoCarteira: 14.01, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "SPX Nimitz FIC FIM", patrimonio: 62000, ganho: -3100, rentabilidade: -4.76, sobreCdi: -36.62, pesoCarteira: 11.43, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "XP Macro FIM", patrimonio: 54000, ganho: 2700, rentabilidade: 5.26, sobreCdi: 40.46, pesoCarteira: 9.95, status: "Em Resgate", dataRef: "28/02/2026" },
  { nome: "Capitânia Premium FIC FIM CP", patrimonio: 40000, ganho: -5200, rentabilidade: -11.50, sobreCdi: -88.46, pesoCarteira: 7.38, status: "Liquidado", dataRef: "15/01/2026" },
];

/* ─── Renda Fixa ─── */
const rendaFixaMonthly: MonthlyRow[] = [
  { mes: "JAN", patrimonio: 720000, ganho: 8640, rent: 1.21, cdi: 1.08, sobreCdi: 112.04 },
  { mes: "FEV", patrimonio: 728200, ganho: 8200, rent: 1.14, cdi: 0.99, sobreCdi: 115.15 },
  { mes: "MAR", patrimonio: 736800, ganho: 8600, rent: 1.18, cdi: 1.12, sobreCdi: 105.36 },
  { mes: "ABR", patrimonio: 745000, ganho: 8200, rent: 1.11, cdi: 1.06, sobreCdi: 104.72 },
  { mes: "MAI", patrimonio: 753500, ganho: 8500, rent: 1.14, cdi: 1.12, sobreCdi: 101.79 },
  { mes: "JUN", patrimonio: 761200, ganho: 7700, rent: 1.02, cdi: 1.07, sobreCdi: 95.33 },
  { mes: "JUL", patrimonio: 769300, ganho: 8100, rent: 1.06, cdi: 1.07, sobreCdi: 99.07 },
  { mes: "AGO", patrimonio: 778000, ganho: 8700, rent: 1.13, cdi: 1.14, sobreCdi: 99.12 },
  { mes: "SET", patrimonio: 785400, ganho: 7400, rent: 0.95, cdi: 0.97, sobreCdi: 97.94 },
  { mes: "OUT", patrimonio: 793200, ganho: 7800, rent: 0.99, cdi: 1.00, sobreCdi: 99.00 },
  { mes: "NOV", patrimonio: 800500, ganho: 7300, rent: 0.92, cdi: 0.93, sobreCdi: 98.92 },
  { mes: "DEZ", patrimonio: 809000, ganho: 8500, rent: 1.06, cdi: 1.12, sobreCdi: 94.64 },
];

const rendaFixaAssets: AssetRow[] = [
  { nome: "CDB Banco Inter 120% CDI", patrimonio: 200000, ganho: 26000, rentabilidade: 14.93, sobreCdi: 114.85, pesoCarteira: 24.72, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "LCI Itaú IPCA+6,5%", patrimonio: 180000, ganho: 19800, rentabilidade: 12.38, sobreCdi: 95.23, pesoCarteira: 22.25, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "CRA Klabin IPCA+7,2%", patrimonio: 150000, ganho: 18000, rentabilidade: 13.64, sobreCdi: 104.92, pesoCarteira: 18.54, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "Debênture Vale IPCA+6,8%", patrimonio: 130000, ganho: 14300, rentabilidade: 12.38, sobreCdi: 95.23, pesoCarteira: 16.07, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "LIG Bradesco 102% CDI", patrimonio: 95000, ganho: 10450, rentabilidade: 12.36, sobreCdi: 95.08, pesoCarteira: 11.74, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "CDB Sofisa 115% CDI", patrimonio: 54000, ganho: 5940, rentabilidade: 12.37, sobreCdi: 95.15, pesoCarteira: 6.68, status: "Em Resgate", dataRef: "28/02/2026" },
];

/* ─── Renda Variável ─── */
const rendaVariavelMonthly: MonthlyRow[] = [
  { mes: "JAN", patrimonio: 255000, ganho: -2550, rent: -0.99, cdi: 1.08, sobreCdi: -91.67 },
  { mes: "FEV", patrimonio: 268000, ganho: 13000, rent: 5.10, cdi: 0.99, sobreCdi: 515.15 },
  { mes: "MAR", patrimonio: 261000, ganho: -7000, rent: -2.61, cdi: 1.12, sobreCdi: -233.04 },
  { mes: "ABR", patrimonio: 270000, ganho: 9000, rent: 3.45, cdi: 1.06, sobreCdi: 325.47 },
  { mes: "MAI", patrimonio: 264000, ganho: -6000, rent: -2.22, cdi: 1.12, sobreCdi: -198.21 },
  { mes: "JUN", patrimonio: 272000, ganho: 8000, rent: 3.03, cdi: 1.07, sobreCdi: 283.18 },
  { mes: "JUL", patrimonio: 269000, ganho: -3000, rent: -1.10, cdi: 1.07, sobreCdi: -102.80 },
  { mes: "AGO", patrimonio: 278000, ganho: 9000, rent: 3.35, cdi: 1.14, sobreCdi: 293.86 },
  { mes: "SET", patrimonio: 275000, ganho: -3000, rent: -1.08, cdi: 0.97, sobreCdi: -111.34 },
  { mes: "OUT", patrimonio: 260000, ganho: -15000, rent: -5.45, cdi: 1.00, sobreCdi: -545.00 },
  { mes: "NOV", patrimonio: 258000, ganho: -2000, rent: -0.77, cdi: 0.93, sobreCdi: -82.80 },
  { mes: "DEZ", patrimonio: 263652, ganho: 5652, rent: 2.19, cdi: 1.12, sobreCdi: 195.54 },
];

const rendaVariavelAssets: AssetRow[] = [
  { nome: "PETR4 - Petrobras PN", patrimonio: 65000, ganho: 3250, rentabilidade: 5.26, sobreCdi: 40.46, pesoCarteira: 24.66, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "VALE3 - Vale ON", patrimonio: 55000, ganho: -2750, rentabilidade: -4.76, sobreCdi: -36.62, pesoCarteira: 20.86, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "ITUB4 - Itaú Unibanco PN", patrimonio: 48000, ganho: 7200, rentabilidade: 17.65, sobreCdi: 135.77, pesoCarteira: 18.21, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "WEGE3 - WEG ON", patrimonio: 38000, ganho: 5700, rentabilidade: 17.65, sobreCdi: 135.77, pesoCarteira: 14.41, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "BBDC4 - Bradesco PN", patrimonio: 32000, ganho: -1600, rentabilidade: -4.76, sobreCdi: -36.62, pesoCarteira: 12.14, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "MGLU3 - Magazine Luiza", patrimonio: 25652, ganho: -7696, rentabilidade: -23.08, sobreCdi: -177.54, pesoCarteira: 9.73, status: "Em Resgate", dataRef: "28/02/2026" },
];

/* ─── Tesouro Direto ─── */
const tesouroMonthly: MonthlyRow[] = [
  { mes: "JAN", patrimonio: 112000, ganho: 1232, rent: 1.11, cdi: 1.08, sobreCdi: 102.78 },
  { mes: "FEV", patrimonio: 113200, ganho: 1200, rent: 1.07, cdi: 0.99, sobreCdi: 108.08 },
  { mes: "MAR", patrimonio: 114500, ganho: 1300, rent: 1.15, cdi: 1.12, sobreCdi: 102.68 },
  { mes: "ABR", patrimonio: 115700, ganho: 1200, rent: 1.05, cdi: 1.06, sobreCdi: 99.06 },
  { mes: "MAI", patrimonio: 117000, ganho: 1300, rent: 1.12, cdi: 1.12, sobreCdi: 100.00 },
  { mes: "JUN", patrimonio: 118200, ganho: 1200, rent: 1.03, cdi: 1.07, sobreCdi: 96.26 },
  { mes: "JUL", patrimonio: 119500, ganho: 1300, rent: 1.10, cdi: 1.07, sobreCdi: 102.80 },
  { mes: "AGO", patrimonio: 120800, ganho: 1300, rent: 1.09, cdi: 1.14, sobreCdi: 95.61 },
  { mes: "SET", patrimonio: 121900, ganho: 1100, rent: 0.91, cdi: 0.97, sobreCdi: 93.81 },
  { mes: "OUT", patrimonio: 123100, ganho: 1200, rent: 0.98, cdi: 1.00, sobreCdi: 98.00 },
  { mes: "NOV", patrimonio: 124200, ganho: 1100, rent: 0.89, cdi: 0.93, sobreCdi: 95.70 },
  { mes: "DEZ", patrimonio: 125500, ganho: 1300, rent: 1.05, cdi: 1.12, sobreCdi: 93.75 },
];

const tesouroAssets: AssetRow[] = [
  { nome: "Tesouro Selic 2029", patrimonio: 45000, ganho: 5400, rentabilidade: 13.64, sobreCdi: 104.92, pesoCarteira: 35.86, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "Tesouro IPCA+ 2035", patrimonio: 35000, ganho: 3850, rentabilidade: 12.38, sobreCdi: 95.23, pesoCarteira: 27.89, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "Tesouro Prefixado 2028", patrimonio: 28000, ganho: 2800, rentabilidade: 11.11, sobreCdi: 85.46, pesoCarteira: 22.31, status: "Ativo", dataRef: "28/02/2026" },
  { nome: "Tesouro IPCA+ c/ Juros 2040", patrimonio: 17500, ganho: 1575, rentabilidade: 9.89, sobreCdi: 76.08, pesoCarteira: 13.94, status: "Ativo", dataRef: "28/02/2026" },
];

/* ─── Map by slug ─── */
export const portfolioDataMap: Record<string, PortfolioData> = {
  "fundos-de-investimentos": {
    metrics: { patrimonio: 542500, ganho: 31200, rentabilidade: 14.20, cdi: 13.00, sobreCdi: 109.23 },
    monthly: fundosMonthly,
    assets: fundosAssets,
    assetDetails: buildAssetDetailsMap(fundosAssets),
  },
  "renda-fixa": {
    metrics: { patrimonio: 809000, ganho: 42500, rentabilidade: 14.22, cdi: 13.00, sobreCdi: 109.46 },
    monthly: rendaFixaMonthly,
    assets: rendaFixaAssets,
    assetDetails: buildAssetDetailsMap(rendaFixaAssets),
  },
  "renda-variavel": {
    metrics: { patrimonio: 263652, ganho: 11956, rentabilidade: 11.80, cdi: 13.00, sobreCdi: 90.77 },
    monthly: rendaVariavelMonthly,
    assets: rendaVariavelAssets,
    assetDetails: buildAssetDetailsMap(rendaVariavelAssets),
  },
  "tesouro-direto": {
    metrics: { patrimonio: 125500, ganho: 5800, rentabilidade: 12.50, cdi: 13.00, sobreCdi: 96.15 },
    monthly: tesouroMonthly,
    assets: tesouroAssets,
    assetDetails: buildAssetDetailsMap(tesouroAssets),
  },
};