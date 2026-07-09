import { diffArrays, diffWordsWithSpace } from "diff";

export type ChangeType = "addition" | "deletion" | "replacement" | "move";

export interface DetectedChange {
  type: ChangeType;
  order: number;
  articleRef: string | null;
  oldText: string | null;
  newText: string | null;
  description: string | null;
}

const ARTICLE_MARKER_RE =
  /^(?:статья|артыкул|глава|раздел|пункт|падпункт)\s+[0-9a-zA-Zа-яёА-ЯЁ.\-]+/iu;

/**
 * Splits normalized document text into paragraph-like blocks. Blank lines
 * separate blocks; numbered/lettered clauses ("1.", "1.1.", "1)") and
 * structural markers (статья/артыкул/глава/раздел/пункт) start new blocks
 * even without a blank line between them, since source documents often keep
 * clauses on consecutive lines.
 */
export function splitIntoParagraphs(text: string): string[] {
  const lines = text.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];

  const CLAUSE_START_RE = /^\s*(\d+(?:\.\d+)*[.)]|[а-яa-z][)])\s/iu;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      if (current.length > 0) {
        blocks.push(current.join(" ").trim());
        current = [];
      }
      continue;
    }

    const startsNewBlock =
      ARTICLE_MARKER_RE.test(trimmed) || CLAUSE_START_RE.test(trimmed);

    if (startsNewBlock && current.length > 0) {
      blocks.push(current.join(" ").trim());
      current = [line];
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    blocks.push(current.join(" ").trim());
  }

  return blocks.filter((block) => block.length > 0);
}

function extractArticleRef(paragraph: string): string | null {
  const match = paragraph.match(ARTICLE_MARKER_RE);
  if (match) return match[0];

  const clauseMatch = paragraph.match(/^\s*(\d+(?:\.\d+)*[.)])/u);
  return clauseMatch ? clauseMatch[1] : null;
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const diff = diffWordsWithSpace(a, b);
  let common = 0;
  for (const part of diff) {
    if (!part.added && !part.removed) common += part.value.length;
  }

  return (2 * common) / (a.length + b.length);
}

/**
 * Compares two documents paragraph-by-paragraph and classifies changes into
 * additions, deletions, replacements, and moves. Uses array-level diffing to
 * find the common backbone of unchanged paragraphs, then pairs up the
 * remaining removed/added paragraphs into replacements (similar content) or
 * moves (identical content at a different position), falling back to plain
 * additions/deletions.
 */
export function detectChanges(
  oldText: string,
  newText: string,
): DetectedChange[] {
  const oldParagraphs = splitIntoParagraphs(oldText);
  const newParagraphs = splitIntoParagraphs(newText);

  const diff = diffArrays(oldParagraphs, newParagraphs);

  interface RemovedItem {
    text: string;
    diffIndex: number;
  }
  interface AddedItem {
    text: string;
    diffIndex: number;
  }

  const removed: RemovedItem[] = [];
  const added: AddedItem[] = [];

  diff.forEach((part, diffIndex) => {
    if (part.removed) {
      for (const text of part.value) removed.push({ text, diffIndex });
    } else if (part.added) {
      for (const text of part.value) added.push({ text, diffIndex });
    }
  });

  const usedAdded = new Set<number>();
  const changes: DetectedChange[] = [];
  let order = 0;

  // Pass 1: exact-text moves (removed paragraph reappears verbatim at a
  // different diff position -- i.e. the surrounding context changed).
  for (const r of removed) {
    const matchIdx = added.findIndex(
      (a, idx) =>
        !usedAdded.has(idx) && a.text === r.text && a.diffIndex !== r.diffIndex,
    );
    if (matchIdx !== -1) {
      usedAdded.add(matchIdx);
      changes.push({
        type: "move",
        order: order++,
        articleRef: extractArticleRef(r.text),
        oldText: r.text,
        newText: added[matchIdx].text,
        description: "Текст перенесён в другую часть документа без изменений содержания",
      });
      r.text = "__MATCHED__";
    }
  }

  const remainingRemoved = removed.filter((r) => r.text !== "__MATCHED__");
  const remainingAdded = added.filter((_, idx) => !usedAdded.has(idx));
  const usedRemaining = new Set<number>();

  // Pass 2: pair similar removed/added paragraphs as replacements.
  for (const r of remainingRemoved) {
    let bestIdx = -1;
    let bestScore = 0;
    remainingAdded.forEach((a, idx) => {
      if (usedRemaining.has(idx)) return;
      const score = similarity(r.text, a.text);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });

    if (bestIdx !== -1 && bestScore >= 0.35) {
      usedRemaining.add(bestIdx);
      changes.push({
        type: "replacement",
        order: order++,
        articleRef: extractArticleRef(r.text) ?? extractArticleRef(remainingAdded[bestIdx].text),
        oldText: r.text,
        newText: remainingAdded[bestIdx].text,
        description: null,
      });
    } else {
      changes.push({
        type: "deletion",
        order: order++,
        articleRef: extractArticleRef(r.text),
        oldText: r.text,
        newText: null,
        description: null,
      });
    }
  }

  remainingAdded.forEach((a, idx) => {
    if (usedRemaining.has(idx)) return;
    changes.push({
      type: "addition",
      order: order++,
      articleRef: extractArticleRef(a.text),
      oldText: null,
      newText: a.text,
      description: null,
    });
  });

  return changes.map((change, idx) => ({ ...change, order: idx }));
}

export { diffWordsWithSpace };
