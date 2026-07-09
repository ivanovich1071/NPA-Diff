import { useState, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useI18n } from "@/lib/i18n";
import { 
  useGetComparison, 
  useUpdateComparison, 
  useGetComparisonReport,
  getComparisonReport,
  useListChatMessages,
  useSendChatMessage,
  ChangeType,
  ReportFormat
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { 
  FileText, Download, CheckCircle, XCircle, AlertCircle, 
  MessageSquare, Send, Bot, User, ArrowRight, Loader2, RefreshCcw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function ComparisonResult() {
  const { id } = useParams();
  const comparisonId = parseInt(id || "0", 10);
  const { t } = useI18n();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: comparison, isLoading, error } = useGetComparison(comparisonId);
  const updateComparison = useUpdateComparison();
  
  const [viewMode, setViewMode] = useState<"full" | "changes">("full");
  const [reviewerNote, setReviewerNote] = useState("");
  const [isExporting, setIsExporting] = useState<"pdf"|"docx"|"html"|null>(null);

  // Chat
  const { data: chatMessages } = useListChatMessages(comparisonId);
  const sendChatMessage = useSendChatMessage();
  const [chatInput, setChatInput] = useState("");
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  useEffect(() => {
    if (comparison?.reviewerNote) {
      setReviewerNote(comparison.reviewerNote);
    }
  }, [comparison]);

  if (isLoading) {
    return (
      <div className="flex flex-col justify-center items-center h-[70vh] gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground font-medium animate-pulse">Анализ документа...</p>
      </div>
    );
  }

  if (error || !comparison) {
    return (
      <div className="p-10 text-center text-destructive">
        <AlertCircle className="w-12 h-12 mx-auto mb-4" />
        <h2 className="text-2xl font-bold">Ошибка загрузки данных</h2>
      </div>
    );
  }

  const handleReview = async (status: "approved" | "rejected") => {
    try {
      await updateComparison.mutateAsync({
        id: comparisonId,
        data: {
          reviewStatus: status,
          reviewerNote: reviewerNote
        }
      });
      queryClient.invalidateQueries({ queryKey: ["/api/comparisons", comparisonId] });
      toast({ title: status === 'approved' ? 'Утверждено' : 'Отклонено' });
    } catch (e) {
      toast({ title: "Ошибка", variant: "destructive" });
    }
  };

  const handleExport = async (format: ReportFormat) => {
    setIsExporting(format);
    try {
      const blob = await getComparisonReport(comparisonId, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${comparisonId}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: "Файл скачан" });
    } catch (e) {
      toast({ title: "Ошибка экспорта", variant: "destructive" });
    } finally {
      setIsExporting(null);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    const content = chatInput;
    setChatInput("");
    
    // Optimistic UI could be added here, but relying on server is safer
    try {
      await sendChatMessage.mutateAsync({
        id: comparisonId,
        data: { content }
      });
      queryClient.invalidateQueries({ queryKey: [`/api/comparisons/${comparisonId}/chat`] });
    } catch (e) {
      toast({ title: "Ошибка отправки", variant: "destructive" });
    }
  };

  const getChangeTypeColor = (type: ChangeType) => {
    switch(type) {
      case 'addition': return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300";
      case 'deletion': return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300";
      case 'replacement': return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300";
      case 'move': return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getChangeTypeLabel = (type: ChangeType) => {
    switch(type) {
      case 'addition': return t('typeAddition');
      case 'deletion': return t('typeDeletion');
      case 'replacement': return t('typeReplacement');
      case 'move': return t('typeMove');
      default: return type;
    }
  };

  // Helper to render diff content based on change type
  const renderChangeText = (change: any, column: 'old' | 'new') => {
    if (column === 'old') {
      if (change.type === 'addition') return <span className="text-muted-foreground italic">—</span>;
      if (change.type === 'deletion') return <span className="diff-deletion">{change.oldText}</span>;
      if (change.type === 'replacement') return <span className="diff-replacement">{change.oldText}</span>;
      if (change.type === 'move') return <span className="diff-move">{change.oldText}</span>;
    } else {
      if (change.type === 'deletion') return <span className="text-muted-foreground italic">—</span>;
      if (change.type === 'addition') return <span className="diff-addition">{change.newText}</span>;
      if (change.type === 'replacement') return <span className="diff-replacement">{change.newText}</span>;
      if (change.type === 'move') return <span className="diff-move">{change.newText}</span>;
    }
    return null;
  };

  return (
    <div className="max-w-[1400px] mx-auto py-6 px-4 flex flex-col gap-6 h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-start justify-between shrink-0 bg-card p-4 rounded-xl border shadow-sm">
        <div>
          <h1 className="text-2xl font-serif font-bold text-primary">{comparison.title}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5 bg-muted px-2 py-1 rounded-md">
              <FileText className="w-3.5 h-3.5" /> {comparison.oldDocumentName}
            </span>
            <ArrowRight className="w-4 h-4" />
            <span className="flex items-center gap-1.5 bg-muted px-2 py-1 rounded-md">
              <FileText className="w-3.5 h-3.5" /> {comparison.newDocumentName}
            </span>
            <Badge variant="outline" className="ml-2 font-mono">
              {comparison.changes.length} изменений
            </Badge>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handleExport("html")} disabled={!!isExporting}>
            {isExporting === "html" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            HTML
          </Button>
          <Button variant="outline" onClick={() => handleExport("docx")} disabled={!!isExporting}>
            {isExporting === "docx" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            DOCX
          </Button>
          <Button variant="outline" onClick={() => handleExport("pdf")} disabled={!!isExporting}>
            {isExporting === "pdf" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            PDF
          </Button>
        </div>
      </div>

      <div className="flex gap-6 min-h-0 flex-1">
        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-card border rounded-xl shadow-sm overflow-hidden">
          <div className="border-b px-4 py-3 flex justify-between items-center bg-muted/20">
            <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)} className="w-fit">
              <TabsList className="h-9">
                <TabsTrigger value="full" className="text-xs px-4">{t('viewFullText')}</TabsTrigger>
                <TabsTrigger value="changes" className="text-xs px-4">{t('viewOnlyChanges')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          
          <ScrollArea className="flex-1 w-full bg-background/50">
            <div className="p-6">
              {/* Diff View */}
              <div className="flex gap-6 w-full">
                {/* Left Column - Old */}
                <div className="flex-1 min-w-0 space-y-6">
                  <div className="sticky top-0 bg-background/95 backdrop-blur z-10 pb-2 border-b font-medium text-muted-foreground uppercase text-xs tracking-wider">
                    {t('uploadOldVersion')}
                  </div>
                  {viewMode === "changes" ? (
                    <div className="space-y-6 font-serif text-[15px] leading-relaxed">
                      {comparison.changes.map((change) => (
                        <div key={`old-${change.id}`} className="group p-4 rounded-lg border bg-card hover:border-primary/20 transition-colors">
                          <div className="text-xs font-sans font-medium text-muted-foreground mb-2 flex justify-between">
                            <span>{change.articleRef || 'Без статьи'}</span>
                          </div>
                          {renderChangeText(change, 'old')}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap p-4 bg-card rounded-lg border text-muted-foreground/80">
                      {/* In a real app, this would be the full text with changes mapped onto it.
                          For this implementation, we'll just show the raw text as a fallback if full-text mapping is too complex. */}
                      {comparison.oldText}
                    </div>
                  )}
                </div>

                {/* Vertical Divider */}
                <div className="w-px bg-border my-8 shrink-0"></div>

                {/* Right Column - New */}
                <div className="flex-1 min-w-0 space-y-6">
                  <div className="sticky top-0 bg-background/95 backdrop-blur z-10 pb-2 border-b font-medium text-muted-foreground uppercase text-xs tracking-wider">
                    {t('uploadNewVersion')}
                  </div>
                  {viewMode === "changes" ? (
                    <div className="space-y-6 font-serif text-[15px] leading-relaxed">
                      {comparison.changes.map((change) => (
                        <div key={`new-${change.id}`} className="group p-4 rounded-lg border bg-card shadow-sm hover:border-primary/30 hover:shadow-md transition-all relative overflow-hidden">
                          <div className={`absolute top-0 left-0 w-1 h-full ${getChangeTypeColor(change.type).split(' ')[0]}`}></div>
                          <div className="text-xs font-sans font-medium mb-3 flex items-center justify-between">
                            <span className="text-foreground">{change.articleRef || 'Без статьи'}</span>
                            <Badge variant="outline" className={`text-[10px] font-normal border-0 ${getChangeTypeColor(change.type)}`}>
                              {getChangeTypeLabel(change.type)}
                            </Badge>
                          </div>
                          <div>
                            {renderChangeText(change, 'new')}
                          </div>
                          {change.description && (
                            <div className="mt-4 pt-3 border-t text-xs font-sans text-muted-foreground flex gap-2">
                              <Bot className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <span>{change.description}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap p-4 bg-card rounded-lg border">
                      {comparison.newText}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Summary table */}
              <div className="mt-12 pt-8 border-t">
                <h3 className="text-lg font-serif font-bold text-primary mb-4">{t('changesTable')}</h3>
                <div className="border rounded-lg overflow-hidden bg-card">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="text-left font-medium p-3 w-[15%]">{t('article')}</th>
                        <th className="text-left font-medium p-3 w-[15%]">{t('changeType')}</th>
                        <th className="text-left font-medium p-3 w-[35%]">{t('oldText')}</th>
                        <th className="text-left font-medium p-3 w-[35%]">{t('newText')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {comparison.changes.map((change) => (
                        <tr key={`table-${change.id}`} className="hover:bg-muted/30">
                          <td className="p-3 align-top font-medium text-xs">{change.articleRef || '-'}</td>
                          <td className="p-3 align-top">
                            <Badge variant="outline" className={`text-[10px] font-normal ${getChangeTypeColor(change.type)}`}>
                              {getChangeTypeLabel(change.type)}
                            </Badge>
                          </td>
                          <td className="p-3 align-top font-serif whitespace-pre-wrap text-muted-foreground/80">{change.oldText || '-'}</td>
                          <td className="p-3 align-top font-serif whitespace-pre-wrap">{change.newText || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Right Sidebar - Tools & Review */}
        <div className="w-[26rem] shrink-0 flex flex-col gap-4 min-h-0">
          
          {/* AI Summary */}
          {comparison.summary && (
            <Card className="shrink-0 shadow-sm border-blue-100 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/10">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2 text-blue-900 dark:text-blue-300">
                  <Bot className="w-4 h-4" />
                  {t('aiSummary')}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="text-sm leading-relaxed text-blue-950/80 dark:text-blue-200/80">
                  {comparison.summary}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Review Block */}
          <Card className="shrink-0 shadow-sm">
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm flex items-center justify-between">
                {t('reviewBlockTitle')}
                {comparison.reviewStatus === 'approved' && <Badge variant="success" className="text-[10px]">{t('statusApproved')}</Badge>}
                {comparison.reviewStatus === 'rejected' && <Badge variant="destructive" className="text-[10px]">{t('statusRejected')}</Badge>}
                {comparison.reviewStatus === 'pending_review' && <Badge variant="secondary" className="text-[10px]">{t('statusPending')}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <Textarea 
                placeholder={t('reviewerNotePlaceholder')}
                className="text-sm min-h-[80px] resize-none"
                value={reviewerNote}
                onChange={(e) => setReviewerNote(e.target.value)}
              />
              <div className="flex gap-2">
                <Button 
                  className="flex-1" 
                  variant={comparison.reviewStatus === 'approved' ? 'default' : 'outline'}
                  onClick={() => handleReview('approved')}
                >
                  <CheckCircle className="w-4 h-4 mr-1.5" />
                  {t('approveBtn')}
                </Button>
                <Button 
                  className="flex-1" 
                  variant={comparison.reviewStatus === 'rejected' ? 'destructive' : 'outline'}
                  onClick={() => handleReview('rejected')}
                >
                  <XCircle className="w-4 h-4 mr-1.5" />
                  {t('rejectBtn')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Chat Widget */}
          <Card className="flex-1 flex flex-col min-h-[28rem] shadow-md border-2 border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30">
            <CardHeader className="pb-2 pt-4 px-4 border-b border-sky-200 dark:border-sky-800 bg-sky-100/70 dark:bg-sky-900/30 shrink-0">
              <CardTitle className="text-base flex items-center gap-2 text-sky-900 dark:text-sky-200">
                <MessageSquare className="w-5 h-5" />
                {t('chatTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={chatScrollRef}>
                {(!chatMessages || chatMessages.length === 0) && (
                  <div className="text-center text-sm text-muted-foreground mt-4 px-2">
                    <Bot className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    {t('chatEmpty')}
                  </div>
                )}
                {chatMessages?.map((msg) => (
                  <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                      {msg.role === 'user' ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                    </div>
                    <div className={`text-sm p-3 rounded-lg max-w-[85%] ${
                      msg.role === 'user' 
                        ? 'bg-primary text-primary-foreground rounded-tr-none' 
                        : 'bg-muted text-foreground rounded-tl-none'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {sendChatMessage.isPending && (
                  <div className="flex gap-2">
                    <div className="shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                    <div className="bg-muted text-foreground p-3 rounded-lg rounded-tl-none flex gap-1 items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '0.2s' }}></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-foreground/40 animate-bounce" style={{ animationDelay: '0.4s' }}></span>
                    </div>
                  </div>
                )}
              </div>
              <div className="p-3 border-t border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/30 shrink-0">
                <form onSubmit={handleSendChat} className="flex gap-2">
                  <Input 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={t('chatPlaceholder')}
                    className="text-sm h-10 bg-white dark:bg-background"
                    disabled={sendChatMessage.isPending}
                  />
                  <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={!chatInput.trim() || sendChatMessage.isPending}>
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>
          
        </div>
      </div>
    </div>
  );
}
