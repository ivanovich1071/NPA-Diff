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
// Hard cap on paragraphs fed into diffArrays. The Myers diff algorithm
// used by diffArrays is O(n * d) where n = paragraph count and d = number
// of differences; on very large legal documents (e.g. a 1 MB+ PDF that
// extracts to tens of thousands of clauses) this blocks the event loop for
// minutes. 5 000 paragraphs covers a typical full law chapter with room to
// spare while keeping diffArrays sub-second in practice.
const MAX_PARAGRAPHS = 5_000;

export function detectChanges(
  oldText: string,
  newText: string,
): DetectedChange[] {
  const allOld = splitIntoParagraphs(oldText);
  const allNew = splitIntoParagraphs(newText);

  const truncated =
    allOld.length > MAX_PARAGRAPHS || allNew.length > MAX_PARAGRAPHS;
  const oldParagraphs = allOld.slice(0, MAX_PARAGRAPHS);
  const newParagraphs = allNew.slice(0, MAX_PARAGRAPHS);

  if (truncated) {
    // Surface the truncation as a synthetic change so the caller and the
    // summary prompt can both mention it explicitly.
    const notice: DetectedChange = {
      type: "addition",
      order: -1,
      articleRef: null,
      oldText: null,
      newText:
        `[Документ слишком большой для полного анализа. Показаны первые ${MAX_PARAGRAPHS} из ${Math.max(allOld.length, allNew.length)} параграфов. Оставшаяся часть не сравнивалась.]`,
      description: "truncation_notice",
    };
    // Will be prepended after sorting by order; we fix the order index at the end.
    const changes = runDiff(oldParagraphs, newParagraphs);
    return [notice, ...changes].map((c, i) => ({ ...c, order: i }));
  }

  return runDiff(oldParagraphs, newParagraphs);
}

function runDiff(
  oldParagraphs: string[],
  newParagraphs: string[],
): DetectedChange[] {
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
  // Index added paragraphs by text so lookup is O(1) amortized instead of
  // an O(removed x added) findIndex scan, which would itself become a
  // quadratic hotspot on large documents even though each comparison here
  // is cheap (plain string equality, not a word-level diff).
  const addedByText = new Map<string, number[]>();
  added.forEach((a, idx) => {
    const bucket = addedByText.get(a.text);
    if (bucket) bucket.push(idx);
    else addedByText.set(a.text, [idx]);
  });

  for (const r of removed) {
    const candidates = addedByText.get(r.text);
    const matchIdx = candidates?.find(
      (idx) => !usedAdded.has(idx) && added[idx].diffIndex !== r.diffIndex,
    );
    if (matchIdx !== undefined) {
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
  //
  // similarity() runs a word-level diff (diffWordsWithSpace) on every
  // candidate pair, so naive O(removed x added) pairing is effectively
  // O(n^2 * diff_cost). On large legal texts (e.g. a full tax code with
  // thousands of numbered clauses) this can pin the CPU for minutes and
  // block the Node event loop, making the whole server unresponsive
  // (including health checks) until it finishes. Guard against that:
  // - Skip obviously mismatched pairs cheaply (length ratio) before
  //   paying for the expensive word-level diff.
  // - If the candidate set is too large for pairwise comparison to be
  //   safe, skip similarity pairing entirely and fall back to reporting
  //   plain deletions/additions -- still correct, just without the
  //   "replacement" grouping for extreme-sized diffs.
  const MAX_PAIRWISE_COMPARISONS = 200_000;
  const canPairSimilar =
    remainingRemoved.length * remainingAdded.length <= MAX_PAIRWISE_COMPARISONS;
  const LENGTH_RATIO_CUTOFF = 3;

  for (const r of remainingRemoved) {
    let bestIdx = -1;
    let bestScore = 0;

    if (canPairSimilar) {
      remainingAdded.forEach((a, idx) => {
        if (usedRemaining.has(idx)) return;

        const longer = Math.max(r.text.length, a.text.length);
        const shorter = Math.min(r.text.length, a.text.length);
        if (shorter === 0 || longer / shorter > LENGTH_RATIO_CUTOFF) return;

        const score = similarity(r.text, a.text);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = idx;
        }
      });
    }

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
