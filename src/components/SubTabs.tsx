import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataReferencia } from "@/contexts/DataReferenciaContext";

const CATEGORY_TABS: { label: string; url: string; carteiraNome: string }[] = [
  { label: "Renda Fixa", url: "/carteira/renda-fixa", carteiraNome: "Renda Fixa" },
  { label: "Moedas", url: "/carteira/cambio", carteiraNome: "Moedas" },
];

export function SubTabs() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { appliedVersion } = useDataReferencia();
  const [visibleTabs, setVisibleTabs] = useState<{ label: string; url: string }[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("controle_de_carteiras")
      .select("nome_carteira")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const nomes = new Set((data || []).map((r: any) => r.nome_carteira));
        const dynamic = CATEGORY_TABS.filter(t => nomes.has(t.carteiraNome));
        setVisibleTabs(dynamic);
      });
  }, [user, appliedVersion]);

  const allTabs = [
    { label: "Investimentos", url: "/carteira/investimentos" },
    ...visibleTabs,
  ];

  return (
    <div className="flex gap-6 border-b border-border bg-card px-6 h-10 items-end overflow-x-auto">
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
  );
}
