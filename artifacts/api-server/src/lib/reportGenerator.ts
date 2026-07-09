import PDFDocument from "pdfkit";
import path from "node:path";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
} from "docx";
import type { Comparison, ComparisonChangeRow } from "@workspace/db";

// PDFKit's built-in fonts (Helvetica, Times, etc.) only cover Latin-1 and
// render Cyrillic text as garbled glyphs. DejaVu Sans has full Cyrillic
// coverage, so we embed it explicitly for all PDF report text.
declare const __dirname: string;

const FONT_REGULAR = path.resolve(__dirname, "assets/fonts/DejaVuSans.ttf");
const FONT_BOLD = path.resolve(
  __dirname,
  "assets/fonts/DejaVuSans-Bold.ttf",
);

const TYPE_LABELS: Record<string, string> = {
  addition: "Добавление",
  deletion: "Удаление",
  replacement: "Замена",
  move: "Перемещение",
};

export function renderHtmlReport(
  comparison: Comparison,
  changes: ComparisonChangeRow[],
): string {
  const escape = (value: string | null) =>
    (value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  const rows = changes
    .map(
      (change) => `
      <tr class="row-${change.type}">
        <td>${escape(TYPE_LABELS[change.type] ?? change.type)}</td>
        <td>${escape(change.articleRef)}</td>
        <td>${escape(change.oldText)}</td>
        <td>${escape(change.newText)}</td>
      </tr>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>${escape(comparison.title)}</title>
<style>
  body { font-family: Georgia, serif; margin: 40px; color: #1a1a1a; }
  h1 { font-size: 20px; }
  .meta { color: #555; margin-bottom: 24px; }
  .summary { background: #f5f5f0; padding: 16px; border-left: 4px solid #8a1f1f; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { border: 1px solid #ccc; padding: 8px; text-align: left; vertical-align: top; }
  th { background: #eee; }
  .row-addition { background: #eaf6ea; }
  .row-deletion { background: #fbeaea; }
  .row-replacement { background: #fbf6df; }
  .row-move { background: #e9f0fb; }
</style>
</head>
<body>
  <h1>${escape(comparison.title)}</h1>
  <div class="meta">
    Старая редакция: ${escape(comparison.oldDocumentName)} &middot;
    Новая редакция: ${escape(comparison.newDocumentName)}
  </div>
  ${comparison.summary ? `<div class="summary">${escape(comparison.summary)}</div>` : ""}
  <table>
    <thead><tr><th>Тип</th><th>Статья / пункт</th><th>Старая редакция</th><th>Новая редакция</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

export async function renderPdfReport(
  comparison: Comparison,
  changes: ComparisonChangeRow[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    doc.registerFont("Body", FONT_REGULAR);
    doc.registerFont("Body-Bold", FONT_BOLD);
    doc.font("Body");

    const chunks: Buffer[] = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.font("Body-Bold").fontSize(18).text(comparison.title, { underline: true });
    doc.font("Body");
    doc.moveDown(0.5);
    doc
      .fontSize(10)
      .fillColor("#555")
      .text(
        `Старая редакция: ${comparison.oldDocumentName} | Новая редакция: ${comparison.newDocumentName}`,
      );
    doc.fillColor("#000");
    doc.moveDown();

    if (comparison.summary) {
      doc.font("Body-Bold").fontSize(12).text("Резюме изменений", { underline: true });
      doc.font("Body").fontSize(10).text(comparison.summary);
      doc.moveDown();
    }

    doc.font("Body-Bold").fontSize(12).text("Перечень изменений", { underline: true });
    doc.font("Body");
    doc.moveDown(0.5);

    for (const change of changes) {
      doc
        .font("Body-Bold")
        .fontSize(10)
        .fillColor("#8a1f1f")
        .text(
          `${TYPE_LABELS[change.type] ?? change.type}${change.articleRef ? " — " + change.articleRef : ""}`,
        );
      doc.font("Body").fillColor("#000");
      if (change.oldText) doc.fontSize(9).text(`Было: ${change.oldText}`);
      if (change.newText) doc.fontSize(9).text(`Стало: ${change.newText}`);
      doc.moveDown(0.5);
    }

    doc.end();
  });
}

export async function renderDocxReport(
  comparison: Comparison,
  changes: ComparisonChangeRow[],
): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({ text: comparison.title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [
        new TextRun(
          `Старая редакция: ${comparison.oldDocumentName} | Новая редакция: ${comparison.newDocumentName}`,
        ),
      ],
    }),
    new Paragraph({ text: "" }),
  ];

  if (comparison.summary) {
    children.push(
      new Paragraph({ text: "Резюме изменений", heading: HeadingLevel.HEADING_2 }),
      new Paragraph({ text: comparison.summary }),
      new Paragraph({ text: "" }),
    );
  }

  children.push(
    new Paragraph({ text: "Перечень изменений", heading: HeadingLevel.HEADING_2 }),
  );

  for (const change of changes) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${TYPE_LABELS[change.type] ?? change.type}${change.articleRef ? " — " + change.articleRef : ""}`,
            bold: true,
          }),
        ],
      }),
    );
    if (change.oldText) children.push(new Paragraph({ text: `Было: ${change.oldText}` }));
    if (change.newText) children.push(new Paragraph({ text: `Стало: ${change.newText}` }));
    children.push(new Paragraph({ text: "" }));
  }

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
