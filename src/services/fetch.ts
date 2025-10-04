/* eslint-disable @typescript-eslint/no-explicit-any */
import { RequestOptions, HttpClientOptions, HttpMethod, HttpError, IHttpClient } from '@/types/fetch';

export class HttpClient implements IHttpClient {
  readonly #baseUrl: string;
  readonly #defaultHeaders: Record<string, string>;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #userAgent: string;
  readonly #retryOn: (resOrErr: Response | Error) => boolean;

  constructor(opts: HttpClientOptions = {}) {
    this.#baseUrl = opts.baseUrl ?? "";
    this.#defaultHeaders = opts.defaultHeaders ?? {};
    this.#timeoutMs = opts.timeoutMs ?? 10_000;
    this.#maxRetries = opts.maxRetries ?? 2;
    this.#userAgent = opts.userAgent ?? "eventbridge-router-httpclient/1.0";
    this.#retryOn = opts.retryOn ?? ((resOrErr: Response | Error) => {
      if (resOrErr instanceof Error) return true; // network/DNS/timeout → retry
      const s = resOrErr.status;
      return s === 429 || (s >= 500 && s < 600);
    });
  }

  #buildUrl(url: string, query?: Record<string, unknown>): string {
    const full = url.startsWith("http") ? url : `${this.#baseUrl}${url}`;
    if (!query || Object.keys(query).length === 0) return full;

    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) v.forEach(i => usp.append(k, String(i)));
      else usp.append(k, String(v));
    }
    return `${full}${full.includes("?") ? "&" : "?"}${usp.toString()}`;
  }

  #sleep(ms: number): Promise<void> {
    return new Promise(res => setTimeout(res, ms));
  }

  #backoff(attempt: number, retryAfterHeader?: string): number {
    // 1) rispetta Retry-After (sec o HTTP-date) se presente
    if (retryAfterHeader) {
      const sec = Number(retryAfterHeader);
      if (!Number.isNaN(sec) && sec > 0) return Math.min(sec, 30) * 1000; // cap a 30s
      const dateMs = Date.parse(retryAfterHeader);
      if (!Number.isNaN(dateMs)) {
        const wait = Math.max(0, dateMs - Date.now()); // evita valori negativi
        return Math.min(wait, 30_000);
      }
    }
    // 2) exponential backoff con jitter
    const base = 200 * 2 ** attempt; // 200ms, 400ms, 800ms...
    const jitter = Math.floor(Math.random() * 150);
    return Math.min(base + jitter, 2_000); // cap 2s
  }

  #serializeBody(body: any, headers: Record<string, string>): any {
    if (body == null) return undefined;

    const ct = Object.keys(headers).find(h => h.toLowerCase() === "content-type");
    const jsonCt = ct ? headers[ct] : undefined;

    if (typeof body === "string" || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      return body;
    }

    if (!jsonCt) {
      headers["Content-Type"] = "application/json";
      return JSON.stringify(body);
    }

    if (jsonCt.includes("application/json")) return JSON.stringify(body);
    return body; // lascia passare stream/form-data ecc.
  }

  async #parseResponse<T>(res: Response, forced?: RequestOptions["responseType"]): Promise<T> {
    const ctype = res.headers.get("content-type") || "";

    try {
      // responseType esplicito
      if (forced === "json") return (await res.json()) as T;
      if (forced === "text") return (await res.text()) as unknown as T;

      // auto-detect da content-type
      if (ctype.includes("json")) return (await res.json()) as T;
      if (ctype.startsWith("text/")) return (await res.text()) as unknown as T;

      // default: prova json → fallback text (webhook possono rispondere diversamente)
      try {
        return (await res.json()) as T;
      } catch {
        return (await res.text()) as unknown as T;
      }
    } catch (e) {
      // parsing failure: restituisci raw testo per debug
      const raw = await res.text().catch(() => "");
      throw new HttpError(`Failed to parse response (${res.status})`, res.status, res.headers, raw as unknown as T);
    }
  }

  async request<T = unknown>(method: HttpMethod, url: string, options: RequestOptions = {}): Promise<T> {
    const {
      headers = {},
      query,
      body,
      timeoutMs: perRequestTimeout = this.#timeoutMs,
      responseType,
      validateStatus = (s: number) => s >= 200 && s < 300,
      signal,
      fireAndForget = false,
    } = options;

    // unisci header (default + user + UA)
    const finalHeaders: Record<string, string> = {
      "User-Agent": this.#userAgent,
      ...this.#defaultHeaders,
      ...headers,
    };

    const finalUrl = this.#buildUrl(url, query);

    // Fire-and-forget: invia senza attendere risposta
    if (fireAndForget) {
      fetch(finalUrl, {
        method,
        headers: finalHeaders,
        body: this.#serializeBody(body, finalHeaders),
        signal,
      }).catch(() => {
        // Ignora errori in modalità fire-and-forget
      });
      return undefined as T;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), perRequestTimeout);

    // cleanup listener per evitare memory leak
    const abortHandler = () => controller.abort();
    if (signal) {
      signal.addEventListener("abort", abortHandler, { once: true });
    }

    let attempt = 0;
    let lastErr: unknown;

    while (attempt <= this.#maxRetries) {
      try {
        const res = await fetch(finalUrl, {
          method,
          headers: finalHeaders,
          body: this.#serializeBody(body, finalHeaders),
          signal: controller.signal,
        });

        if (validateStatus(res.status)) {
          clearTimeout(timer);
          if (signal) signal.removeEventListener("abort", abortHandler);
          return await this.#parseResponse<T>(res, responseType);
        }

        // status non ok → forse retry
        if (attempt < this.#maxRetries && this.#retryOn(res)) {
          const wait = this.#backoff(attempt, res.headers.get("retry-after") || undefined);
          await this.#sleep(wait);
          attempt++;
          continue;
        }

        // errore definitivo
        const data = await this.#parseResponse<any>(res, responseType).catch(async () => await res.text());
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", abortHandler);
        throw new HttpError(`HTTP ${res.status} ${res.statusText}`, res.status, res.headers, data);
      } catch (err: any) {
        lastErr = err;
        const isAbort = err?.name === "AbortError";

        if (attempt < this.#maxRetries && this.#retryOn(err) && !isAbort) {
          const wait = this.#backoff(attempt);
          await this.#sleep(wait);
          attempt++;
          continue;
        }
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", abortHandler);
        // normalizza errore di timeout/abort
        if (isAbort) {
          throw new HttpError(`Request aborted/timeout after ${perRequestTimeout}ms`, 0, new Headers(), undefined);
        }
        // rilancia l'ultimo errore
        if (err instanceof HttpError) throw err;
        throw new HttpError(err?.message || "Network error", 0, new Headers(), undefined);
      }
    }

    // in teoria non ci arrivi, ma per sicurezza:
    throw lastErr instanceof Error ? lastErr : new Error("Unknown HTTP error");
  }

  async get<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("GET", url, options);
  }

  async post<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("POST", url, options);
  }

  async put<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("PUT", url, options);
  }

  async patch<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("PATCH", url, options);
  }

  async delete<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
    return this.request<T>("DELETE", url, options);
  }
}