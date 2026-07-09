import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
      <AlertCircle className="w-16 h-16 text-destructive mb-6" />
      <h1 className="text-4xl font-serif font-bold mb-4">Страница не найдена</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        Возможно, вы перешли по устаревшей ссылке, или страница была удалена.
      </p>
      <Link href="/">
        <Button size="lg">На главную</Button>
      </Link>
    </div>
  );
}
