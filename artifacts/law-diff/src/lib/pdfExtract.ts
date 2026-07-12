/**
 * Client-side PDF text extraction using pdf.js.
 * Called in handleFileUpload() when the user picks a PDF file so that
 * the raw binary never has to travel to the server.
 */
import * as pdfjsLib from "pdfjs-dist";

// Tell pdf.js where to find its web worker. Vite processes the `new URL(...)`
// pattern and copies the asset to the build output automatically.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).href;

export async function extractPdfTextFromFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib
    .getDocument({ data: new Uint8Array(arrayBuffer) })
    .promise;

  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Group text items into lines by their Y-coordinate on the page.
    // Items at the same Y (within 2 pt) belong to the same line.
    let lastY: number | null = null;
    const lines: string[] = [];
    let currentLine = "";

    for (const rawItem of textContent.items) {
      // TextItem has `str` and `transform`; TextMarkedContent does not.
      if (!("str" in rawItem)) continue;
      const item = rawItem as { str: string; transform: number[] };
      const y = item.transform[5]; // vertical position on the page

      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = item.str;
      } else {
        // Same line: append with a space only if needed.
        if (currentLine && !currentLine.endsWith(" ") && item.str && !item.str.startsWith(" ")) {
          currentLine += " ";
        }
        currentLine += item.str;
      }
      lastY = y;
    }
    if (currentLine.trim()) lines.push(currentLine.trim());

    pageTexts.push(lines.join("\n"));
  }

  return pageTexts.join("\n\n");
}
