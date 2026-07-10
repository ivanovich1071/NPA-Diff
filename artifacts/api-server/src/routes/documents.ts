import { Router, type IRouter } from "express";
import dns from "node:dns";
import net from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import {
  ExtractDocumentBody,
  ExtractDocumentResponse,
  FetchDocumentFromUrlBody,
  FetchDocumentFromUrlResponse,
} from "@workspace/api-zod";
import {
  detectExtension,
  extractTextFromBuffer,
  UnsupportedFileTypeError,
} from "../lib/documentExtraction";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Only these legal-portal domains (and their subdomains) may be fetched.
const ALLOWED_HOSTS = ["pravo.by", "etalonline.by", "nalog.gov.by"];

const FETCH_TIMEOUT_MS = 60_000;
const MAX_RESPONSE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_REDIRECTS = 3;

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ALLOWED_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 0) return true; // IETF protocol assignments / documentation (192.0.0.0/24, 192.0.2.0/24)
  if (a === 192 && b === 168) return true; // private
  if (a === 198 && b >= 18 && b <= 19) return true; // benchmarking
  if (a === 198 && b === 51) return true; // documentation (198.51.100.0/24)
  if (a === 203 && b === 0) return true; // documentation (203.0.113.0/24)
  if (a >= 224) return true; // multicast (224-239) + reserved (240-255)
  return false;
}

/**
 * Expands any valid IPv6 textual form (including "::" compression and a
 * trailing dotted-decimal IPv4 tail) into 8 explicit 16-bit hex groups, so
 * every representation of the same address normalizes to one canonical form
 * before classification — closing the gap where alternate encodings (hex
 * IPv4-mapped groups, IPv4-compatible addresses, etc.) could slip past a
 * string-prefix check.
 */
function expandIpv6(ip: string): number[] | null {
  let head = ip;
  let tail = "";
  const dottedMatch = ip.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dottedMatch) {
    head = dottedMatch[1];
    const octets = dottedMatch[2].split(".").map(Number);
    if (octets.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
    tail = [
      ((octets[0] << 8) | octets[1]).toString(16),
      ((octets[2] << 8) | octets[3]).toString(16),
    ].join(":");
    head = head.replace(/:$/, "") + (tail ? ":" + tail : "");
  }

  const parts = head.split("::");
  if (parts.length > 2) return null;

  const parseGroups = (s: string): number[] =>
    s === "" ? [] : s.split(":").map((g) => parseInt(g, 16));

  let groups: number[];
  if (parts.length === 2) {
    const left = parseGroups(parts[0]);
    const right = parseGroups(parts[1]);
    const missing = 8 - left.length - right.length;
    if (missing < 0) return null;
    groups = [...left, ...new Array(missing).fill(0), ...right];
  } else {
    groups = parseGroups(head);
  }

  if (groups.length !== 8 || groups.some((g) => Number.isNaN(g) || g < 0 || g > 0xffff)) {
    return null;
  }
  return groups;
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const groups = expandIpv6(ip.toLowerCase());
  if (!groups) return true; // unparseable: fail closed

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d, non-zero)
  // addresses embed an IPv4 address in the last two groups — classify that.
  const isMapped = groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
  const isCompat =
    groups.slice(0, 6).every((g) => g === 0) && (groups[6] !== 0 || groups[7] > 1);
  if (isMapped || isCompat) {
    const ipv4 = [
      (groups[6] >> 8) & 0xff,
      groups[6] & 0xff,
      (groups[7] >> 8) & 0xff,
      groups[7] & 0xff,
    ].join(".");
    return isPrivateOrReservedIpv4(ipv4);
  }

  const lower = ip.toLowerCase();
  if (groups.every((g) => g === 0)) return true; // :: unspecified
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1 loopback
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // link-local fe80::/10
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local fc00::/7
  if (lower.startsWith("64:ff9b:")) return true; // NAT64
  if (lower.startsWith("2001:db8:")) return true; // documentation
  if (lower.startsWith("ff")) return true; // multicast
  return false;
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateOrReservedIpv4(ip);
  if (net.isIPv6(ip)) return isPrivateOrReservedIpv6(ip);
  return true; // unrecognized format: fail closed
}

/**
 * A `dns.lookup`-compatible function used as the connect-time resolver for
 * the outbound Agent. Because this same function performs both the
 * validation and the address actually handed to the socket connector, there
 * is no gap between "checked" and "connected to" — closing the DNS-rebinding
 * TOCTOU window that a separate pre-flight resolution step would leave open.
 */
function safeLookup(
  hostname: string,
  options: dns.LookupAllOptions | dns.LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | dns.LookupAddress[],
    family?: number,
  ) => void,
): void {
  dns.lookup(hostname, { all: true, verbatim: true }, (err, records) => {
    if (err) return callback(err, []);
    if (!records || records.length === 0) {
      return callback(new Error("DNS resolution returned no addresses"), []);
    }
    const safeRecords = records.filter(
      (r) => !isPrivateOrReservedIp(r.address),
    );
    if (safeRecords.length === 0) {
      return callback(
        new Error(
          `All resolved addresses for ${hostname} are private/reserved`,
        ),
        [],
      );
    }
    callback(null, safeRecords as dns.LookupAddress[]);
  });
}

const safeAgent = new Agent({
  connect: { lookup: safeLookup as never },
});

function validateFetchTarget(url: URL): void {
  if (url.protocol !== "https:") {
    throw new Error("Only https:// URLs are allowed");
  }
  if (!isAllowedHost(url.hostname)) {
    throw new Error(`Host ${url.hostname} is not in the allowed list`);
  }
}

/**
 * Fetches a URL with a manual, bounded redirect chain: every hop (including
 * redirect targets) is re-validated against the host allowlist, resolved via
 * `safeAgent` (which pins connections to public addresses only), and the
 * response body is capped in size.
 */
async function fetchAllowedUrl(
  initialUrl: URL,
): Promise<{ response: Response; finalUrl: URL; buffer: Buffer }> {
  let currentUrl = initialUrl;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    validateFetchTarget(currentUrl);

    const controller = new AbortController();
    let timedOut = false;
    // The timeout must stay armed for the entire hop — connect, headers, AND
    // body streaming — otherwise a server that sends headers promptly but
    // stalls mid-body (slow/stuck connection) hangs the request forever.
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, FETCH_TIMEOUT_MS);
    let response: Response;
    let buffer: Buffer;
    try {
      response = (await undiciFetch(currentUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; law-diff/1.0)" },
        redirect: "manual",
        signal: controller.signal,
        dispatcher: safeAgent,
      } as never)) as unknown as Response;

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        // Drain/cancel the redirect response body so the connection is
        // released promptly instead of lingering until GC.
        if (response.body) {
          await response.body.cancel().catch(() => {});
        }
        if (!location) {
          throw new Error("Redirect response without a Location header");
        }
        currentUrl = new URL(location, currentUrl);
        continue;
      }

      const contentLength = response.headers.get("content-length");
      if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
        throw new Error("Response exceeds the maximum allowed size");
      }

      buffer = await readBodyWithLimit(response, MAX_RESPONSE_BYTES);
    } catch (err) {
      if (timedOut) {
        throw new Error(
          `Request to ${currentUrl.hostname} timed out after ${FETCH_TIMEOUT_MS}ms`,
        );
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    return { response, finalUrl: currentUrl, buffer };
  }

  throw new Error("Too many redirects");
}

async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Buffer> {
  if (!response.body) {
    return Buffer.from(await response.arrayBuffer());
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error("Response exceeds the maximum allowed size");
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

router.post("/documents/extract", async (req, res) => {
  const body = ExtractDocumentBody.parse(req.body);
  const extension = detectExtension(body.filename);

  if (!extension) {
    throw new UnsupportedFileTypeError(body.filename);
  }

  const buffer = Buffer.from(body.contentBase64, "base64");

  if (buffer.byteLength > MAX_RESPONSE_BYTES) {
    return res.status(413).json({
      error: "file_too_large",
      message: `Файл слишком большой (${(buffer.byteLength / (1024 * 1024)).toFixed(1)} МБ). Максимально допустимый размер — ${MAX_RESPONSE_BYTES / (1024 * 1024)} МБ.`,
    });
  }

  let text: string;
  try {
    text = await extractTextFromBuffer(buffer, extension);
  } catch (err) {
    if (err instanceof UnsupportedFileTypeError) throw err;
    logger.warn(
      { err, filename: body.filename },
      "Failed to extract text from uploaded document",
    );
    return res.status(422).json({
      error: "extraction_failed",
      message: "Не удалось извлечь текст из загруженного документа",
    });
  }

  res.json(
    ExtractDocumentResponse.parse({ text, filename: body.filename }),
  );
  return;
});

router.post("/documents/fetch-url", async (req, res) => {
  const body = FetchDocumentFromUrlBody.parse(req.body);

  let url: URL;
  try {
    url = new URL(body.url);
  } catch {
    return res.status(400).json({
      error: "invalid_url",
      message: "Указан некорректный URL",
    });
  }

  let response: Response;
  let finalUrl: URL;
  let buffer: Buffer;
  try {
    const result = await fetchAllowedUrl(url);
    response = result.response;
    finalUrl = result.finalUrl;
    buffer = result.buffer;
  } catch (err) {
    logger.warn({ err, url: body.url }, "Failed to fetch document URL");
    return res.status(502).json({
      error: "fetch_failed",
      message:
        "Не удалось загрузить документ по указанной ссылке. Поддерживаются только ссылки на pravo.by, etalonline.by и nalog.gov.by",
    });
  }

  if (!response.ok) {
    return res.status(502).json({
      error: "fetch_failed",
      message: `Сервер источника вернул ошибку ${response.status}`,
    });
  }

  const contentType = response.headers.get("content-type") ?? "";
  const filename =
    finalUrl.pathname.split("/").filter(Boolean).pop() ?? "document";

  let text: string;
  try {
    if (
      contentType.includes("pdf") ||
      filename.toLowerCase().endsWith(".pdf")
    ) {
      text = await extractTextFromBuffer(buffer, "pdf");
    } else if (
      contentType.includes("officedocument.wordprocessingml") ||
      filename.toLowerCase().endsWith(".docx")
    ) {
      text = await extractTextFromBuffer(buffer, "docx");
    } else {
      // Assume HTML: strip tags to plain text as a best-effort extraction.
      const html = buffer.toString("utf-8");
      text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, "\n")
        .replace(/&nbsp;/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
  } catch (err) {
    logger.warn(
      { err, url: body.url },
      "Failed to extract text from fetched document",
    );
    return res.status(422).json({
      error: "extraction_failed",
      message: "Не удалось извлечь текст документа по указанной ссылке",
    });
  }

  if (text.length < 20) {
    return res.status(422).json({
      error: "extraction_failed",
      message: "Не удалось извлечь текст документа по указанной ссылке",
    });
  }

  res.json(
    FetchDocumentFromUrlResponse.parse({ text, filename }),
  );
  return;
});

export default router;
