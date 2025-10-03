export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export interface HttpClientOptions {
  baseUrl?: string;
  defaultHeaders?: Record<string, string>;
  timeoutMs?: number;           // default 10_000
  maxRetries?: number;          // default 2 (=> 3 tentativi totali)
  retryOn?: (res: Response | Error) => boolean; // override logica retry
  userAgent?: string;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: any;
  timeoutMs?: number;
  responseType?: "json" | "text";  // EventBridge: JSON (API) o text (webhook response)
  validateStatus?: (status: number) => boolean;
  signal?: AbortSignal;
}

export interface IHttpClient {
  get<T = unknown>(url: string, options?: RequestOptions): Promise<T>;
  post<T = unknown>(url: string, options?: RequestOptions): Promise<T>;
  put<T = unknown>(url: string, options?: RequestOptions): Promise<T>;
  patch<T = unknown>(url: string, options?: RequestOptions): Promise<T>;
  delete<T = unknown>(url: string, options?: RequestOptions): Promise<T>;
  request<T = unknown>(method: HttpMethod, url: string, options?: RequestOptions): Promise<T>;
}

export class HttpError<T = unknown> extends Error {
  public status: number;
  public data?: T;
  public headers: Headers;

  constructor(message: string, status: number, headers: Headers, data?: T) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.headers = headers;
    this.data = data;
  }
}