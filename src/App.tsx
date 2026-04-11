import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate, Outlet } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";

// Lazy-loaded heavy pages
const CarteiraRendaFixa = lazy(() => import("@/pages/CarteiraRendaFixaPage"));
const CarteiraCambioPage = lazy(() => import("@/pages/CarteiraCambioPage"));
const CalculadoraPage = lazy(() => import("@/pages/CalculadoraPage"));
const PosicaoConsolidadaPage = lazy(() => import("@/pages/PosicaoConsolidadaPage"));
const CadastrarTransacaoPage = lazy(() => import("@/pages/CadastrarTransacaoPage"));
const ProventosRecebidosPage = lazy(() => import("@/pages/ProventosRecebidosPage"));
const MovimentacoesPage = lazy(() => import("@/pages/MovimentacoesPage"));
const CustodiaPage = lazy(() => import("@/pages/CustodiaPage"));
const ControleCarteirasPage = lazy(() => import("@/pages/ControleCarteirasPage"));
const AnaliseIndividualPage = lazy(() => import("@/pages/AnaliseIndividualPage"));
const AdminPage = lazy(() => import("@/pages/AdminPage"));
const ConfiguracoesPage = lazy(() => import("@/pages/ConfiguracoesPage"));

// Lighter pages loaded eagerly or lazily
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const AuthPage = lazy(() => import("@/pages/AuthPage"));
const OnboardingPage = lazy(() => import("@/pages/OnboardingPage"));
const PlanosPage = lazy(() => import("@/pages/PlanosPage"));
const CheckoutPage = lazy(() => import("@/pages/CheckoutPage"));
const GenerateDocxPage = lazy(() => import("@/pages/GenerateDocxPage"));

// Lightweight stubs
import {
  CarteiraVisaoGeral,
  CarteiraRendaVariavel,
  CarteiraFundos,
  CarteiraTesouroDireto,
} from "@/pages/AppPages";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const LazyFallback = () => (
  <div className="flex min-h-[200px] items-center justify-center text-muted-foreground">
    Carregando...
  </div>
);

const ProtectedRoute = () => {
  const { user, loading, hasProfile } = useAuth();

  if (loading)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  if (!user) return <Navigate to="/auth" replace />;
  if (hasProfile === null)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  if (!hasProfile) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
};

const OnboardingRoute = () => {
  const { user, loading, hasProfile } = useAuth();
  if (loading || hasProfile === null)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    );
  if (!user) return <Navigate to="/auth" replace />;
  if (hasProfile) return <Navigate to="/carteira/renda-fixa" replace />;
  return (
    <Suspense fallback={<LazyFallback />}>
      <OnboardingPage />
    </Suspense>
  );
};

const App = () => (
  <AuthProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<LazyFallback />}>
            <Routes>
              {/* Public routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/onboarding" element={<OnboardingRoute />} />
              
              <Route path="/planos" element={<PlanosPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/gerar-docx" element={<GenerateDocxPage />} />

              {/* Protected routes */}
              <Route element={<ProtectedRoute />}>
                <Route element={<AppLayout />}>
                  <Route path="/welcome" element={<Navigate to="/carteira/renda-fixa" replace />} />
                  <Route path="/carteira" element={<Navigate to="/carteira/renda-fixa" replace />} />
                  <Route path="/carteira/renda-fixa" element={<CarteiraRendaFixa />} />
                  <Route path="/carteira/cambio" element={<CarteiraCambioPage />} />
                  <Route path="/carteira/renda-variavel" element={<CarteiraRendaVariavel />} />
                  <Route path="/carteira/fundos" element={<CarteiraFundos />} />
                  <Route path="/carteira/tesouro-direto" element={<CarteiraTesouroDireto />} />
                  <Route path="/posicao-consolidada" element={<PosicaoConsolidadaPage />} />
                  <Route path="/movimentacoes" element={<MovimentacoesPage />} />
                  <Route path="/custodia" element={<CustodiaPage />} />
                  <Route path="/controle-carteiras" element={<ControleCarteirasPage />} />
                  <Route path="/proventos" element={<ProventosRecebidosPage />} />
                  <Route path="/cadastrar-transacao" element={<CadastrarTransacaoPage />} />
                  <Route path="/configuracoes" element={<ConfiguracoesPage />} />
                  <Route path="/usuario" element={<div><h1 className="text-lg font-semibold text-foreground">Usuário</h1></div>} />
                  <Route path="/admin" element={<AdminPage />} />
                  <Route path="/calculadora" element={<CalculadoraPage />} />
                </Route>
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </AuthProvider>
);

export default App;
