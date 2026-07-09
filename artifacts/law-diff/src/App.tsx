import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import { Navbar } from '@/components/layout';
import StartComparison from '@/pages/start';
import HistoryPage from '@/pages/history';
import ComparisonResult from '@/pages/result';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

function Router() {
  return (
    <div className="min-h-[100dvh] flex flex-col w-full bg-background font-sans">
      <Navbar />
      <main className="flex-1 w-full">
        <Switch>
          <Route path="/" component={StartComparison} />
          <Route path="/history" component={HistoryPage} />
          <Route path="/comparisons/:id" component={ComparisonResult} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;