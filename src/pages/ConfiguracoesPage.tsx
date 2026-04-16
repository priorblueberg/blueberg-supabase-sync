import { useState } from "react";
import { Trash2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataReferencia } from "@/contexts/DataReferenciaContext";
import { resetAllAppCaches } from "@/lib/resetCaches";
import { invalidateAllCaches } from "@/lib/dataCache";
import { invalidateEngineCache } from "@/lib/engineCache";
import { recalculateAllForDataReferencia } from "@/lib/syncEngine";
import { format } from "date-fns";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function ConfiguracoesPage() {
  const { user } = useAuth();
  const { dataReferencia, applyDataReferencia, setIsRecalculating } = useDataReferencia();
  const [deleting, setDeleting] = useState(false);
  const [isReprocessing, setIsReprocessing] = useState(false);

  const handleReprocess = async () => {
    if (!user || isReprocessing) return;
    setIsReprocessing(true);
    setIsRecalculating(true);
    try {
      invalidateAllCaches();
      invalidateEngineCache();
      await recalculateAllForDataReferencia(user.id, format(dataReferencia, "yyyy-MM-dd"));
      applyDataReferencia();
      toast.success("Reprocessamento completo realizado com sucesso");
    } catch (err) {
      console.error("Erro no reprocessamento forçado", err);
      toast.error("Erro ao reprocessar");
    } finally {
      setIsRecalculating(false);
      setIsReprocessing(false);
    }
  };

  const handleReset = async () => {
    if (!user) return;
    if (
      !window.confirm(
        "Tem certeza que deseja redefinir TODAS as movimentações, custódia e carteiras? Esta ação é irreversível."
      )
    )
      return;

    setDeleting(true);
    try {
      const { error: movErr } = await supabase
        .from("movimentacoes")
        .delete()
        .eq("user_id", user.id);
      if (movErr) throw movErr;

      const { error: custErr } = await supabase
        .from("custodia")
        .delete()
        .eq("user_id", user.id);
      if (custErr) throw custErr;

      const { error: cartErr } = await supabase
        .from("controle_de_carteiras")
        .delete()
        .eq("user_id", user.id);
      if (cartErr) throw cartErr;

      // Invalidate every in-memory cache and force global recalculation
      resetAllAppCaches();
      applyDataReferencia();

      toast.success("Todos os registros foram redefinidos com sucesso.");
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao redefinir registros.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Configurações</h1>
        <p className="text-xs text-muted-foreground">
          Personalize o comportamento da sua ferramenta
        </p>
      </div>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-sm">Redefinir Movimentações</CardTitle>
          <CardDescription>
            Remove todos os registros das tabelas de Movimentações, Custódia e
            Carteiras. Esta ação é irreversível.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button
            onClick={handleReset}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-md bg-destructive px-5 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            <Trash2 size={16} />
            {deleting ? "Redefinindo..." : "Redefinir Movimentações"}
          </button>
        </CardContent>
      </Card>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="text-sm">Reprocessar Dados</CardTitle>
          <CardDescription>
            Força o reprocessamento completo de todos os ativos e recalcula
            posições, custódia e rentabilidade.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button
            onClick={handleReprocess}
            disabled={isReprocessing}
            className="inline-flex items-center gap-2 rounded-md border border-primary bg-background px-5 py-2.5 text-sm font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={isReprocessing ? "animate-spin" : ""} />
            {isReprocessing ? "Reprocessando..." : "Reprocessar"}
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
