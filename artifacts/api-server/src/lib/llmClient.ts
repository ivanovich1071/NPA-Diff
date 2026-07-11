import { logger } from "./logger";

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

const MISTRAL_MODEL = "mistral-small-latest";
const OPENROUTER_MODEL = "qwen/qwen-max";
// Mistral Small's context window is 256K tokens. We approximate token count
// as text length / 3.5 (Cyrillic-heavy text tokenizes denser than English)
// and switch to OpenRouter's Qwen (1M token window) above this threshold.
const MISTRAL_CHAR_BUDGET = 256_000 * 3.5;
// Hard timeout for each LLM API call. Replit's edge proxy aborts connections
// after ~130 s; keeping this well below that ensures the POST /comparisons
// response always arrives before the proxy cuts the connection.
const LLM_TIMEOUT_MS = 90_000;

function estimateChars(turns: ChatTurn[]): number {
  return turns.reduce((sum, turn) => sum + turn.content.length, 0);
}

async function callMistral(turns: ChatTurn[]): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is not configured");

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MISTRAL_MODEL,
      messages: turns,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mistral API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Mistral API returned an empty response");
  return content;
}

async function callOpenRouter(turns: ChatTurn[]): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not configured");

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: turns,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenRouter API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter API returned an empty response");
  return content;
}

/**
 * Calls Mistral Small by default. Switches to OpenRouter's Qwen (1M token
 * window) when the estimated prompt size exceeds Mistral's 256K token
 * window, or automatically falls back to it if the Mistral call fails.
 */
export async function callLLM(turns: ChatTurn[]): Promise<string> {
  const tooLarge = estimateChars(turns) > MISTRAL_CHAR_BUDGET;

  if (!tooLarge) {
    try {
      return await callMistral(turns);
    } catch (err) {
      logger.warn({ err }, "Mistral call failed, falling back to OpenRouter");
    }
  } else {
    logger.info("Prompt exceeds Mistral context budget, using OpenRouter");
  }

  return callOpenRouter(turns);
}
