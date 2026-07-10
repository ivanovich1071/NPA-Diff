import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useI18n } from "@/lib/i18n";
import { 
  useCreateComparison, 
  useExtractDocument, 
  useFetchDocumentFromUrl 
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Link as LinkIcon, Type, FileText, Loader2, Scale } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const comparisonSchema = z.object({
  title: z.string().min(1, "Обязательное поле"),
  oldText: z.string().min(1, "Обязательное поле"),
  newText: z.string().min(1, "Обязательное поле"),
  oldDocumentName: z.string().min(1, "Обязательное поле"),
  newDocumentName: z.string().min(1, "Обязательное поле"),
});

type FormValues = z.infer<typeof comparisonSchema>;

export default function StartComparison() {
  const { t, language } = useI18n();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const createComparison = useCreateComparison();
  const extractDocument = useExtractDocument();
  const fetchUrl = useFetchDocumentFromUrl();

  const [oldTab, setOldTab] = useState("file");
  const [newTab, setNewTab] = useState("file");
  const [oldProcessing, setOldProcessing] = useState(false);
  const [newProcessing, setNewProcessing] = useState(false);
  const oldRequestToken = useRef(0);
  const newRequestToken = useRef(0);

  const isProcessingFile = oldProcessing || newProcessing;

  const form = useForm<FormValues>({
    resolver: zodResolver(comparisonSchema),
    defaultValues: {
      title: "",
      oldText: "",
      newText: "",
      oldDocumentName: "",
      newDocumentName: "",
    }
  });

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        } else {
          reject(new Error("Failed to convert file to base64"));
        }
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isOld: boolean) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const tokenRef = isOld ? oldRequestToken : newRequestToken;
    const setProcessing = isOld ? setOldProcessing : setNewProcessing;
    const myToken = ++tokenRef.current;

    setProcessing(true);
    try {
      const base64 = await fileToBase64(file);
      const res = await extractDocument.mutateAsync({
        data: {
          filename: file.name,
          contentBase64: base64
        }
      });

      if (tokenRef.current !== myToken) return; // cancelled

      if (isOld) {
        form.setValue("oldText", res.text);
        form.setValue("oldDocumentName", res.filename);
      } else {
        form.setValue("newText", res.text);
        form.setValue("newDocumentName", res.filename);
      }
      
      toast({ title: `Файл ${file.name} успешно загружен` });
    } catch (err) {
      if (tokenRef.current !== myToken) return; // cancelled
      console.error(err);
      toast({ title: t('errorUpload'), variant: "destructive" });
    } finally {
      if (tokenRef.current === myToken) {
        setProcessing(false);
      }
    }
  };

  const handleUrlFetch = async (url: string, isOld: boolean) => {
    if (!url) return;
    const tokenRef = isOld ? oldRequestToken : newRequestToken;
    const setProcessing = isOld ? setOldProcessing : setNewProcessing;
    const myToken = ++tokenRef.current;

    setProcessing(true);
    try {
      const res = await fetchUrl.mutateAsync({ data: { url } });
      if (tokenRef.current !== myToken) return; // cancelled

      if (isOld) {
        form.setValue("oldText", res.text);
        form.setValue("oldDocumentName", res.filename || url);
      } else {
        form.setValue("newText", res.text);
        form.setValue("newDocumentName", res.filename || url);
      }
      toast({ title: `Документ по ссылке успешно загружен` });
    } catch (err) {
      if (tokenRef.current !== myToken) return; // cancelled
      console.error(err);
      toast({ title: t('errorUpload'), variant: "destructive" });
    } finally {
      if (tokenRef.current === myToken) {
        setProcessing(false);
      }
    }
  };

  const handleCancelUpload = (isOld: boolean) => {
    const tokenRef = isOld ? oldRequestToken : newRequestToken;
    const setProcessing = isOld ? setOldProcessing : setNewProcessing;
    tokenRef.current++; // invalidates any in-flight request's result
    setProcessing(false);
    toast({ title: "Загрузка отменена" });
  };

  const onSubmit = async (data: FormValues) => {
    try {
      const res = await createComparison.mutateAsync({
        data: {
          title: data.title,
          language,
          oldDocumentName: data.oldDocumentName || "Текст (Старая редакция)",
          oldText: data.oldText,
          newDocumentName: data.newDocumentName || "Текст (Новая редакция)",
          newText: data.newText
        }
      });
      setLocation(`/comparisons/${res.id}`);
    } catch (err) {
      console.error(err);
      toast({ title: t('errorCompare'), variant: "destructive" });
    }
  };

  const DocumentInputBlock = ({ isOld }: { isOld: boolean }) => {
    const tabState = isOld ? oldTab : newTab;
    const setTabState = isOld ? setOldTab : setNewTab;
    const title = isOld ? t('uploadOldVersion') : t('uploadNewVersion');
    const textFieldName = isOld ? "oldText" : "newText";
    const nameFieldName = isOld ? "oldDocumentName" : "newDocumentName";
    const processing = isOld ? oldProcessing : newProcessing;
    
    // For URL input
    const [url, setUrl] = useState("");

    return (
      <Card className="border-border shadow-sm overflow-hidden">
        <div className="bg-muted/30 px-6 py-4 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-primary">
            <FileText className="h-5 w-5 text-muted-foreground" />
            {title}
          </h2>
        </div>
        <CardContent className="p-6">
          <Tabs value={tabState} onValueChange={setTabState} className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="file" className="text-xs">
                <Upload className="w-3.5 h-3.5 mr-2" />
                Файл
              </TabsTrigger>
              <TabsTrigger value="text" className="text-xs">
                <Type className="w-3.5 h-3.5 mr-2" />
                Текст
              </TabsTrigger>
              <TabsTrigger value="url" className="text-xs">
                <LinkIcon className="w-3.5 h-3.5 mr-2" />
                Ссылка
              </TabsTrigger>
            </TabsList>

            <TabsContent value="file" className="mt-0">
              <div className="border-2 border-dashed border-border rounded-lg p-10 flex flex-col items-center justify-center text-center bg-muted/10 hover:bg-muted/30 transition-colors">
                {processing ? (
                  <>
                    <Loader2 className="h-10 w-10 text-muted-foreground mb-4 animate-spin" />
                    <p className="text-sm font-medium mb-4">
                      {t('processing')}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      onClick={() => handleCancelUpload(isOld)}
                    >
                      Отмена
                    </Button>
                  </>
                ) : (
                  <>
                    <Upload className="h-10 w-10 text-muted-foreground mb-4" />
                    <p className="text-sm font-medium mb-1">
                      {t('buttonSelectFile')}
                    </p>
                    <p className="text-xs text-muted-foreground mb-4">
                      DOCX, PDF, TXT
                    </p>
                    <Button variant="outline" size="sm" className="relative overflow-hidden cursor-pointer" type="button">
                      <span>Выбрать</span>
                      <input
                        type="file"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        accept=".docx,.pdf,.txt"
                        onChange={(e) => handleFileUpload(e, isOld)}
                        disabled={isProcessingFile}
                        aria-label="Upload file"
                      />
                    </Button>
                  </>
                )}
                {form.watch(nameFieldName) && !processing && (
                  <div className="mt-4 p-2 bg-success/10 text-success-foreground rounded text-sm w-full font-medium truncate">
                    ✓ {form.watch(nameFieldName)}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="text" className="mt-0">
              <FormField
                control={form.control}
                name={textFieldName}
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea 
                        placeholder={t('pasteTextPlaceholder')} 
                        className="min-h-[240px] resize-y font-mono text-xs p-4" 
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </TabsContent>

            <TabsContent value="url" className="mt-0">
              <div className="flex flex-col gap-4 py-8 px-4 border rounded-lg bg-muted/10">
                <div className="flex gap-2">
                  <Input 
                    placeholder={t('urlPlaceholder')} 
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    disabled={processing}
                  />
                  {processing ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleCancelUpload(isOld)}
                    >
                      Отмена
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      onClick={() => handleUrlFetch(url, isOld)}
                      disabled={!url || isProcessingFile}
                    >
                      Загрузить
                    </Button>
                  )}
                </div>
                {processing && (
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t('processing')}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Поддерживаются ссылки на pravo.by, etalonline.by и nalog.gov.by
                </p>
                {form.watch(nameFieldName) && tabState === 'url' && !processing && (
                  <div className="mt-2 p-2 bg-success/10 text-success-foreground rounded text-sm w-full font-medium truncate">
                    ✓ {form.watch(nameFieldName)}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="max-w-6xl mx-auto py-10 px-4">
      <div className="mb-10 text-center max-w-2xl mx-auto">
        <h1 className="text-4xl font-serif font-bold text-primary mb-4 tracking-tight">
          {t('startComparison')}
        </h1>
        <p className="text-muted-foreground">
          Загрузите две редакции документа, чтобы получить детальный отчет об изменениях.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          <Card className="border-border shadow-sm">
            <CardContent className="p-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-semibold">{t('comparisonTitle')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('comparisonTitlePlaceholder')} className="h-12 text-base" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-8 items-start">
            <DocumentInputBlock isOld={true} />
            <DocumentInputBlock isOld={false} />
          </div>

          <div className="flex justify-center pt-8 border-t">
            <Button 
              type="submit" 
              size="lg" 
              className="px-12 h-14 text-base rounded-full shadow-lg"
              disabled={createComparison.isPending || isProcessingFile}
            >
              {createComparison.isPending ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {t('processing')}
                </>
              ) : (
                <>
                  <Scale className="mr-2 h-5 w-5" />
                  {t('buttonCompare')}
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
