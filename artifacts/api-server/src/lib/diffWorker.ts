/**
 * Node.js worker thread that runs detectChanges in isolation so it cannot
 * block the main event loop. Spawned by detectChangesInWorker() in
 * comparisons.ts with a hard 90-second timeout.
 */
import { parentPort, workerData } from "node:worker_threads";
import { detectChanges } from "./documentDiff";

const { oldText, newText } = workerData as { oldText: string; newText: string };

try {
  const changes = detectChanges(oldText, newText);
  parentPort!.postMessage({ ok: true, changes });
} catch (err) {
  parentPort!.postMessage({ ok: false, error: String(err) });
}
