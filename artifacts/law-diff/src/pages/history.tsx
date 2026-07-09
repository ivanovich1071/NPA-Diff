import { useI18n } from "@/lib/i18n";
import { useListComparisons, useDeleteComparison } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { Trash2, FileText, ExternalLink, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function HistoryPage() {
  const { t } = useI18n();
  const { data: comparisons, isLoading } = useListComparisons();
  const deleteComparison = useDeleteComparison();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = async (id: number) => {
    if (!confirm("Вы уверены?")) return;
    try {
      await deleteComparison.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: ["/api/comparisons"] });
      toast({ title: "Удалено" });
    } catch (e) {
      toast({ title: "Ошибка удаления", variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary mb-2">
            {t('historyTitle')}
          </h1>
          <p className="text-muted-foreground">
            Архив всех проведенных сравнений документов.
          </p>
        </div>
        <Link href="/">
          <Button>
            <FileText className="w-4 h-4 mr-2" />
            {t('navNew')}
          </Button>
        </Link>
      </div>

      {!comparisons || comparisons.length === 0 ? (
        <div className="text-center py-20 bg-muted/20 border border-dashed rounded-xl">
          <History className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-20" />
          <h3 className="text-lg font-medium text-muted-foreground">{t('historyEmpty')}</h3>
        </div>
      ) : (
        <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[40%]">{t('colTitle')}</TableHead>
                <TableHead>{t('colDate')}</TableHead>
                <TableHead>{t('colStatus')}</TableHead>
                <TableHead>{t('colChanges')}</TableHead>
                <TableHead className="text-right">{t('colAction')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comparisons.map((item) => (
                <TableRow key={item.id} className="group">
                  <TableCell className="font-medium">
                    <Link href={`/comparisons/${item.id}`} className="hover:underline hover:text-primary transition-colors flex items-center gap-2">
                      {item.title}
                      <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                    <div className="text-xs text-muted-foreground mt-1 truncate max-w-sm">
                      {item.oldDocumentName} → {item.newDocumentName}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(item.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1.5 items-start">
                      {item.status === 'completed' && <Badge variant="success">Завершено</Badge>}
                      {item.status === 'processing' && <Badge variant="secondary" className="animate-pulse">В процессе</Badge>}
                      {item.status === 'failed' && <Badge variant="destructive">Ошибка</Badge>}
                      
                      {item.reviewStatus === 'approved' && <Badge variant="outline" className="border-success text-success">Утверждено</Badge>}
                      {item.reviewStatus === 'rejected' && <Badge variant="outline" className="border-destructive text-destructive">Отклонено</Badge>}
                      {item.reviewStatus === 'pending_review' && <Badge variant="outline" className="text-muted-foreground">Ожидает проверки</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="font-mono bg-muted px-2 py-1 rounded text-xs">{item.changesCount}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Link href={`/comparisons/${item.id}`}>
                        <Button variant="outline" size="sm">
                          {t('openComparison')}
                        </Button>
                      </Link>
                      <Button variant="ghost" size="icon" className="text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// Need to import History for the empty state icon
import { History } from "lucide-react";