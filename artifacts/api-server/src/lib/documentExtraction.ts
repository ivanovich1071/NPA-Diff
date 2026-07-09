import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export type SupportedExtension = "docx" | "pdf" | "txt";

function normalizeExtractedText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function detectExtension(filename: string): SupportedExtension | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".txt")) return "txt";
  return null;
}

export async function extractTextFromBuffer(
  buffer: Buffer,
  extension: SupportedExtension,
): Promise<string> {
  if (extension === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return normalizeExtractedText(result.value);
  }

  if (extension === "pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return normalizeExtractedText(result.text);
    } finally {
      await parser.destroy();
    }
  }

  return normalizeExtractedText(buffer.toString("utf-8"));
}

export class UnsupportedFileTypeError extends Error {
  constructor(filename: string) {
    super(
      `Unsupported file type for "${filename}". Only DOCX, PDF, and TXT are supported.`,
    );
  }
}
