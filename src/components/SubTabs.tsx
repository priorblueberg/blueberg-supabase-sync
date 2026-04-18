import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataReferencia } from "@/contexts/DataReferenciaContext";
import { Badge } from "@/components/ui/badge";

const CATEGORY_TABS: { label: string; url: string; carteiraNome: string }[] = [
  { label: "Renda Fixa", url: "/carteira/renda-fixa", carteiraNome: "Renda Fixa" },
  { label: "Moedas", url: "/carteira/cambio", carteiraNome: "Câmbio" },
];

export function SubTabs() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { appliedVersion, dataReferenciaISO } = useDataReferencia();
  const [visibleTabs, setVisibleTabs] = useState<{ label: string; url: string }[]>([]);
  const [investimentosDataCalculo, setInvestimentosDataCalculo] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("controle_de_carteiras")
      .select("nome_carteira, data_calculo")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const nomes = new Set((data || []).map((r: any) => r.nome_carteira));
        const dynamic = CATEGORY_TABS.filter(t => nomes.has(t.carteiraNome));
        setVisibleTabs(dynamic);
        const inv = (data || []).find((r: any) => r.nome_carteira === "Investimentos");
        setInvestimentosDataCalculo(inv?.data_calculo ?? null);
      });
  }, [user, appliedVersion]);

  const allTabs = [
    { label: "Investimentos", url: "/carteira/investimentos" },
    ...visibleTabs,
  ];

  // TAG global: compara data de referência com a última posição da Carteira Investimentos
  const isRetroativa = investimentosDataCalculo
    ? dataReferenciaISO < investimentosDataCalculo
    : false;

  return (
    <div className="flex items-end justify-between border-b border-border bg-card px-6 h-10 overflow-x-auto">
      <div className="flex gap-6 items-end">
        {allTabs.map((tab) => {
          const active = pathname === tab.url;
          return (
            <Link
              key={tab.url}
              to={tab.url}
              className={`whitespace-nowrap pb-2 text-xs font-medium border-b-2 transition-colors ${
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              style={{ transition: "color 120ms linear, border-color 120ms linear" }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
      {investimentosDataCalculo && (
        <div className="pb-2">
          {isRetroativa ? (
            <Badge className="bg-destructive hover:bg-destructive text-destructive-foreground text-[10px] px-2 py-0.5">
              Visão Retroativa
            </Badge>
          ) : (
            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] px-2 py-0.5">
              Último Fechamento
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
