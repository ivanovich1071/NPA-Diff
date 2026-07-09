import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const comparisonsTable = pgTable("comparisons", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  language: text("language").notNull().default("ru"),
  oldDocumentName: text("old_document_name").notNull(),
  oldText: text("old_text").notNull(),
  newDocumentName: text("new_document_name").notNull(),
  newText: text("new_text").notNull(),
  status: text("status").notNull().default("processing"),
  reviewStatus: text("review_status").notNull().default("pending_review"),
  reviewerNote: text("reviewer_note"),
  summary: text("summary"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const comparisonChangesTable = pgTable("comparison_changes", {
  id: serial("id").primaryKey(),
  comparisonId: integer("comparison_id")
    .notNull()
    .references(() => comparisonsTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  order: integer("order").notNull(),
  articleRef: text("article_ref"),
  oldText: text("old_text"),
  newText: text("new_text"),
  description: text("description"),
});

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  comparisonId: integer("comparison_id")
    .notNull()
    .references(() => comparisonsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertComparisonSchema = createInsertSchema(
  comparisonsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertComparison = z.infer<typeof insertComparisonSchema>;
export type Comparison = typeof comparisonsTable.$inferSelect;

export const insertComparisonChangeSchema = createInsertSchema(
  comparisonChangesTable,
).omit({ id: true });
export type InsertComparisonChange = z.infer<
  typeof insertComparisonChangeSchema
>;
export type ComparisonChangeRow = typeof comparisonChangesTable.$inferSelect;

export const insertChatMessageSchema = createInsertSchema(
  chatMessagesTable,
).omit({ id: true, createdAt: true });
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessageRow = typeof chatMessagesTable.$inferSelect;
