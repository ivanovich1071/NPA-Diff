import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import { db, comparisonsTable, comparisonChangesTable, chatMessagesTable } from "@workspace/db";
import {
  ListChatMessagesParams,
  ListChatMessagesResponse,
  SendChatMessageParams,
  SendChatMessageBody,
  SendChatMessageResponse,
} from "@workspace/api-zod";
import { callLLM, type ChatTurn } from "../lib/llmClient";

const router: IRouter = Router();

router.get("/comparisons/:id/chat", async (req, res) => {
  const { id } = ListChatMessagesParams.parse(req.params);

  const rows = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.comparisonId, id))
    .orderBy(asc(chatMessagesTable.createdAt));

  res.json(ListChatMessagesResponse.parse(rows));
});

router.post("/comparisons/:id/chat", async (req, res) => {
  const { id } = SendChatMessageParams.parse(req.params);
  const body = SendChatMessageBody.parse(req.body);

  const [comparison] = await db
    .select()
    .from(comparisonsTable)
    .where(eq(comparisonsTable.id, id));

  if (!comparison) {
    return res.status(404).json({ error: "not_found", message: "Сравнение не найдено" });
  }

  await db.insert(chatMessagesTable).values({
    comparisonId: id,
    role: "user",
    content: body.content,
  });

  const changes = await db
    .select()
    .from(comparisonChangesTable)
    .where(eq(comparisonChangesTable.comparisonId, id))
    .orderBy(comparisonChangesTable.order);

  const history = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.comparisonId, id))
    .orderBy(asc(chatMessagesTable.createdAt));

  const changesSummary = changes
    .slice(0, 150)
    .map((c) => {
      const ref = c.articleRef ? ` (${c.articleRef})` : "";
      return `- [${c.type}]${ref} было: ${c.oldText ?? "—"} | стало: ${c.newText ?? "—"}`;
    })
    .join("\n");

  const turns: ChatTurn[] = [
    {
      role: "system",
      content: `Ты — юридический ассистент, отвечающий на вопросы о сравнении редакций документа "${comparison.title}". Резюме изменений: ${comparison.summary ?? "нет"}.
Список изменений:
${changesSummary}
Отвечай кратко и по существу на русском или белорусском языке (в зависимости от языка вопроса), опираясь только на приведённые изменения и резюме.`,
    },
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const replyContent = await callLLM(turns);

  const [assistantMessage] = await db
    .insert(chatMessagesTable)
    .values({ comparisonId: id, role: "assistant", content: replyContent })
    .returning();

  res.status(201).json(SendChatMessageResponse.parse(assistantMessage));
  return;
});

export default router;
