import { useState, useRef, useEffect } from "react";
import { AiChatDialog } from "@/components/AiChatDialog";
import { format, parse, isValid, subDays, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, ChevronDown, RefreshCw, Plus, MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useDataReferencia } from "@/contexts/DataReferenciaContext";
import { useBoletaModal } from "@/contexts/BoletaModalContext";
import { recalculateAllForDataReferencia } from "@/lib/syncEngine";
import { invalidateAllCaches } from "@/lib/dataCache";
import { invalidateEngineCache } from "@/lib/engineCache";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function getMaxDate() {
  return subDays(startOfDay(new Date()), 1);
}

function clampDate(date: Date, minDate: Date | null): Date {
  const max = getMaxDate();
  let result = date > max ? max : date;
  if (minDate && result < minDate) result = minDate;
  return result;
}

export function AppHeader({ disableControls = false }: { disableControls?: boolean }) {
  const { dataReferencia, setDataReferencia, dataReferenciaISO, applyDataReferencia, setIsRecalculating } = useDataReferencia();
  const [inputValue, setInputValue] = useState(format(dataReferencia, "dd/MM/yyyy"));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isForceRecalculating, setIsForceRecalculating] = useState(false);
  // Staged date: what the user picked but hasn't applied yet
  const [stagedDate, setStagedDate] = useState<Date>(dataReferencia);
  const [minDate, setMinDate] = useState<Date | null>(null);
  const [investimentosDataCalculo, setInvestimentosDataCalculo] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const { openBoleta } = useBoletaModal();

  // Fetch data_inicio of carteira Investimentos to use as min date
  useEffect(() => {
    if (!user) return;
    supabase
      .from("controle_de_carteiras")
      .select("data_inicio, data_calculo")
      .eq("user_id", user.id)
      .eq("nome_carteira", "Investimentos")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.data_inicio) {
          setMinDate(new Date(data.data_inicio + "T00:00:00"));
        }
        setInvestimentosDataCalculo(data?.data_calculo ?? null);
      });
  }, [user]);

  const isStagedSameAsApplied = format(stagedDate, "yyyy-MM-dd") === format(dataReferencia, "yyyy-MM-dd");

  const handleForceRecalculate = async () => {
    if (!user || isForceRecalculating) return;
    setIsForceRecalculating(true);
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
      setIsForceRecalculating(false);
    }
  };

  const handleApply = () => {
    if (!user || isStagedSameAsApplied) return;
    const t0 = performance.now();
    console.log("[PERF][Header] ▶ handleApply START (local-only)");
    const clamped = clampDate(stagedDate, minDate);
    setDataReferencia(clamped);
    setStagedDate(clamped);
    setInputValue(format(clamped, "dd/MM/yyyy"));
    // Pure local state change — no DB writes.
    // Pages react to appliedVersion and use engineCache to slice results.
    applyDataReferencia();
    console.log(`[PERF][Header] ■ handleApply COMPLETE (${(performance.now()-t0).toFixed(0)}ms total)`);
    toast.success("Data de referência aplicada com sucesso");
  };

  const stageDate = (date: Date) => {
    const clamped = clampDate(date, minDate);
    if (minDate && date < minDate) {
      toast.error(`Data anterior ao início dos seus investimentos (${format(minDate, "dd/MM/yyyy")})`);
    }
    setStagedDate(clamped);
    setInputValue(format(clamped, "dd/MM/yyyy"));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 8);
    let formatted = raw;
    if (raw.length > 2 && raw.length <= 4) {
      formatted = `${raw.slice(0, 2)}/${raw.slice(2)}`;
    } else if (raw.length > 4) {
      formatted = `${raw.slice(0, 2)}/${raw.slice(2, 4)}/${raw.slice(4)}`;
    }
    setInputValue(formatted);
  };

  const commitInput = () => {
    const parsed = parse(inputValue, "dd/MM/yyyy", new Date());
    if (isValid(parsed)) {
      stageDate(parsed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.blur();
      commitInput();
    }
  };

  const handleDateSelect = (d: Date | undefined) => {
    if (d) {
      stageDate(d);
    }
    setCalendarOpen(false);
  };

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const maxDate = getMaxDate();

  return (
    <div className="relative">
      <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground outline-none" style={{ transition: "color 120ms linear" }}>
            <span className="truncate max-w-[220px]">{user?.email}</span>
            <ChevronDown size={14} strokeWidth={1.5} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            <DropdownMenuItem onClick={() => navigate("/usuario")} className="text-xs cursor-pointer">
              Informações Pessoais
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout} className="text-xs cursor-pointer text-destructive">
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className={`flex items-center gap-4${disableControls ? " pointer-events-none opacity-40" : ""}`}>
          <button
            onClick={() => openBoleta({ origin: "header" })}
            className="flex items-center gap-1 rounded-md border border-primary px-2 py-1 text-xs text-primary hover:bg-primary hover:text-primary-foreground bg-background"
            style={{ transition: "all 120ms linear" }}
          >
            <Plus size={14} strokeWidth={1.5} />
            <span>Cadastrar Transação</span>
          </button>

          <button
            onClick={() => setChatOpen(true)}
            className="flex items-center gap-1 rounded-md border border-accent-foreground/20 px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground bg-background"
            style={{ transition: "all 120ms linear" }}
          >
            <MessageCircle size={14} strokeWidth={1.5} />
            <span>Converse com a IA</span>
          </button>

          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Posição em:</span>
            <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1 bg-background">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={commitInput}
                onKeyDown={handleKeyDown}
                className="w-[80px] bg-transparent text-foreground text-xs outline-none"
                placeholder="dd/mm/aaaa"
              />
              <button
                onClick={() => setCalendarOpen(!calendarOpen)}
                className="text-muted-foreground hover:text-primary"
                style={{ transition: "color 120ms linear" }}
              >
                <CalendarIcon size={14} strokeWidth={1.5} />
              </button>
            </div>
            <button
              onClick={handleApply}
              disabled={isStagedSameAsApplied}
              className="rounded-md border border-primary px-3 py-1 text-xs font-medium text-primary hover:bg-primary hover:text-primary-foreground bg-background disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ transition: "all 120ms linear" }}
              title="Aplicar data de referência"
            >
              Aplicar
            </button>
            {investimentosDataCalculo && (
              dataReferenciaISO < investimentosDataCalculo ? (
                <Badge
                  onClick={() => {
                    const d1 = getMaxDate();
                    const clamped = clampDate(d1, minDate);
                    setDataReferencia(clamped);
                    setStagedDate(clamped);
                    setInputValue(format(clamped, "dd/MM/yyyy"));
                    applyDataReferencia();
                    toast.success("Data de referência ajustada para D-1");
                  }}
                  className="bg-destructive hover:bg-destructive/80 text-destructive-foreground text-[10px] px-2 py-0.5 cursor-pointer"
                  title="Clique para voltar para D-1"
                >
                  Visão Retroativa
                </Badge>
              ) : (
                <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] px-2 py-0.5">
                  Último Fechamento
                </Badge>
              )
            )}
          </div>

          {isAdmin && (
            <button
              onClick={handleForceRecalculate}
              disabled={isForceRecalculating}
              className="flex items-center gap-1 rounded-md border border-destructive/50 px-2 py-1 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50 bg-background"
              style={{ transition: "all 120ms linear" }}
              title="Forçar reprocessamento completo de todos os ativos"
            >
              <RefreshCw size={12} strokeWidth={1.5} className={isForceRecalculating ? "animate-spin" : ""} />
              <span>Reprocessar</span>
            </button>
          )}

        </div>
      </header>

      {calendarOpen && (
        <div className="border-b border-border bg-card flex justify-end px-4 py-2">
          <Calendar
            mode="single"
            selected={dataReferencia}
            onSelect={handleDateSelect}
            locale={ptBR}
            disabled={minDate ? { after: maxDate, before: minDate } : { after: maxDate }}
            className="pointer-events-auto"
          />
        </div>
      )}

      <AiChatDialog open={chatOpen} onOpenChange={setChatOpen} />
    </div>
  );
}
