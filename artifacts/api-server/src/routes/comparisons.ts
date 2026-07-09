import { Router, type IRouter } from "express";
import { eq, desc, count } from "drizzle-orm";
import {
  db,
  comparisonsTable,
  comparisonChangesTable,
  chatMessagesTable,
  type ComparisonChangeRow,
} from "@workspace/db";
import {
  CreateComparisonBody,
  CreateComparisonResponse,
  GetComparisonParams,
  GetComparisonResponse,
  UpdateComparisonParams,
  UpdateComparisonBody,
  UpdateComparisonResponse,
  DeleteComparisonParams,
  ListComparisonsResponse,
  GetComparisonReportParams,
} from "@workspace/api-zod";
import { detectChanges } from "../lib/documentDiff";
import { callLLM } from "../lib/llmClient";
import {
  renderHtmlReport,
  renderPdfReport,
  renderDocxReport,
} from "../lib/reportGenerator";
import { logger } from "../lib/logger";

const router: IRouter = Router();

async function loadComparisonWithChanges(id: number) {
  const [comparison] = await db
    .select()
    .from(comparisonsTable)
    .where(eq(comparisonsTable.id, id));

  if (!comparison) return null;

  const changes = await db
    .select()
    .from(comparisonChangesTable)
    .where(eq(comparisonChangesTable.comparisonId, id))
    .orderBy(comparisonChangesTable.order);

  return { comparison, changes };
}

function buildSummaryPrompt(
  title: string,
  changes: { type: string; articleRef: string | null; oldText: string | null; newText: string | null }[],
): string {
  const lines = changes
    .slice(0, 200)
    .map((c) => {
      const ref = c.articleRef ? ` (${c.articleRef})` : "";
      return `- [${c.type}]${ref} было: ${c.oldText ?? "—"} | стало: ${c.newText ?? "—"}`;
    })
    .join("\n");

  return `Ты — юридический аналитик. Документ "${title}" сравнивается в двух редакциях. Ниже список обнаруженных изменений по пунктам.
Составь краткое резюме на русском языке (5-10 предложений) о сути изменений: что добавлено, что удалено, что изменено по смыслу, и какие практические последствия это может иметь. Пиши по существу, без вступлений.

Изменения:
${lines}`;
}

router.get("/comparisons", async (_req, res) => {
  const rows = await db
    .select({
      id: comparisonsTable.id,
      title: comparisonsTable.title,
      language: comparisonsTable.language,
      oldDocumentName: comparisonsTable.oldDocumentName,
      newDocumentName: comparisonsTable.newDocumentName,
      status: comparisonsTable.status,
      reviewStatus: comparisonsTable.reviewStatus,
      createdAt: comparisonsTable.createdAt,
    })
    .from(comparisonsTable)
    .orderBy(desc(comparisonsTable.createdAt));

  const counts = await db
    .select({
      comparisonId: comparisonChangesTable.comparisonId,
      changesCount: count(),
    })
    .from(comparisonChangesTable)
    .groupBy(comparisonChangesTable.comparisonId);

  const countMap = new Map(counts.map((c) => [c.comparisonId, c.changesCount]));

  const data = rows.map((row) => ({
    ...row,
    changesCount: countMap.get(row.id) ?? 0,
  }));

  res.json(ListComparisonsResponse.parse(data));
});

router.post("/comparisons", async (req, res) => {
  const body = CreateComparisonBody.parse(req.body);

  const [inserted] = await db
    .insert(comparisonsTable)
    .values({
      title: body.title,
      language: body.language,
      oldDocumentName: body.oldDocumentName,
      oldText: body.oldText,
      newDocumentName: body.newDocumentName,
      newText: body.newText,
      status: "processing",
    })
    .returning();

  try {
    const detected = detectChanges(body.oldText, body.newText);

    let insertedChanges: ComparisonChangeRow[] = [];
    if (detected.length > 0) {
      insertedChanges = await db
        .insert(comparisonChangesTable)
        .values(
          detected.map((change) => ({
            comparisonId: inserted.id,
            type: change.type,
            order: change.order,
            articleRef: change.articleRef,
            oldText: change.oldText,
            newText: change.newText,
            description: change.description,
          })),
        )
        .returning();
    }

    let summary: string;
    if (detected.length === 0) {
      summary = "Существенных изменений между редакциями не обнаружено.";
    } else {
      summary = await callLLM([
        {
          role: "system",
          content:
            "Ты — опытный юридический аналитик, помогающий сравнивать редакции нормативных правовых актов.",
        },
        { role: "user", content: buildSummaryPrompt(body.title, detected) },
      ]);
    }

    const [updated] = await db
      .update(comparisonsTable)
      .set({ status: "completed", summary })
      .where(eq(comparisonsTable.id, inserted.id))
      .returning();

    res.status(201).json(
      CreateComparisonResponse.parse({ ...updated, changes: insertedChanges }),
    );
  } catch (err) {
    logger.error({ err }, "Comparison processing failed");
    const [failed] = await db
      .update(comparisonsTable)
      .set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      })
      .where(eq(comparisonsTable.id, inserted.id))
      .returning();

    res.status(201).json(
      CreateComparisonResponse.parse({ ...failed, changes: [] }),
    );
  }
});

router.get("/comparisons/:id", async (req, res) => {
  const { id } = GetComparisonParams.parse(req.params);
  const result = await loadComparisonWithChanges(id);

  if (!result) {
    return res.status(404).json({ error: "not_found", message: "Сравнение не найдено" });
  }

  res.json(
    GetComparisonResponse.parse({ ...result.comparison, changes: result.changes }),
  );
  return;
});

router.patch("/comparisons/:id", async (req, res) => {
  const { id } = UpdateComparisonParams.parse(req.params);
  const body = UpdateComparisonBody.parse(req.body);

  const [updated] = await db
    .update(comparisonsTable)
    .set(body)
    .where(eq(comparisonsTable.id, id))
    .returning();

  if (!updated) {
    return res.status(404).json({ error: "not_found", message: "Сравнение не найдено" });
  }

  const changes = await db
    .select()
    .from(comparisonChangesTable)
    .where(eq(comparisonChangesTable.comparisonId, id))
    .orderBy(comparisonChangesTable.order);

  res.json(UpdateComparisonResponse.parse({ ...updated, changes }));
  return;
});

router.delete("/comparisons/:id", async (req, res) => {
  const { id } = DeleteComparisonParams.parse(req.params);
  await db.delete(comparisonsTable).where(eq(comparisonsTable.id, id));
  res.status(204).send();
});

router.get("/comparisons/:id/report/:format", async (req, res) => {
  const { id, format } = GetComparisonReportParams.parse(req.params);
  const result = await loadComparisonWithChanges(id);

  if (!result) {
    return res.status(404).json({ error: "not_found", message: "Сравнение не найдено" });
  }

  function contentDisposition(extension: string): string {
    const encoded = encodeURIComponent(`${result!.comparison.title}.${extension}`);
    return `attachment; filename="report.${extension}"; filename*=UTF-8''${encoded}`;
  }

  if (format === "html") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", contentDisposition("html"));
    res.send(renderHtmlReport(result.comparison, result.changes));
    return;
  }

  if (format === "pdf") {
    const buffer = await renderPdfReport(result.comparison, result.changes);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", contentDisposition("pdf"));
    res.send(buffer);
    return;
  }

  const buffer = await renderDocxReport(result.comparison, result.changes);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  res.setHeader("Content-Disposition", contentDisposition("docx"));
  res.send(buffer);
  return;
});

export default router;
