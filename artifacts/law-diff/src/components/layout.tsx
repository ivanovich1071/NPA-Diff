import { Link, useLocation } from "wouter";
import { useI18n } from "@/lib/i18n";
import { Button } from "./ui/button";
import { BookOpen, Scale, History, PlusCircle } from "lucide-react";
import { useHealthCheck } from "@workspace/api-client-react";

export function Navbar() {
  const { t, language, setLanguage } = useI18n();
  const [location] = useLocation();
  const { isSuccess } = useHealthCheck(
    { query: { retry: false, refetchInterval: 60000 } }
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" />
            <div>
              <div className="font-serif font-bold text-lg leading-tight tracking-tight text-primary flex items-center gap-2">
                {t('appTitle')}
                <span className={`w-2 h-2 rounded-full ${isSuccess ? 'bg-success' : 'bg-muted'} inline-block`} title={isSuccess ? "API Online" : "API Offline"} />
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">
                {t('appSubtitle')}
              </div>
            </div>
          </Link>

          <nav className="hidden md:flex gap-6">
            <Link href="/" className={`text-sm font-medium transition-colors hover:text-primary ${location === '/' ? 'text-primary border-b-2 border-primary py-5 -mb-[2px]' : 'text-muted-foreground'}`}>
              <span className="flex items-center gap-2">
                <PlusCircle className="h-4 w-4" />
                {t('navNew')}
              </span>
            </Link>
            <Link href="/history" className={`text-sm font-medium transition-colors hover:text-primary ${location === '/history' ? 'text-primary border-b-2 border-primary py-5 -mb-[2px]' : 'text-muted-foreground'}`}>
              <span className="flex items-center gap-2">
                <History className="h-4 w-4" />
                {t('navHistory')}
              </span>
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-muted rounded-md p-1">
            <button
              onClick={() => setLanguage('ru')}
              className={`text-xs px-3 py-1.5 rounded-sm transition-all font-medium ${language === 'ru' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              RU
            </button>
            <button
              onClick={() => setLanguage('be')}
              className={`text-xs px-3 py-1.5 rounded-sm transition-all font-medium ${language === 'be' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              BE
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
