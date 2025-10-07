import { Plugin, PluginMode, PluginContext } from "@/types/plugin";
import { RequestOptions, HttpMethod } from "@/types/fetch";

export class PluginBase implements Plugin {
  public name!: string;
  public mode?: PluginMode;
  protected context?: PluginContext;

  /**
   * Inizializza il plugin salvando il contesto
   * I plugin che fanno override devono chiamare super.init(context)
   */
  init(context: PluginContext): void {
    this.context = context;
  }

  /**
   * Verifica se il client HTTP è disponibile nel contesto
   */
  protected ensureHttpClient(): void {
    if (!this.context?.http) {
      throw new Error(`HTTP client not available in plugin context for plugin: ${this.name}`);
    }
  }

  /**
   * Esegue una HTTP request gestendo automaticamente sync/async mode
   * - In modalità async: fire-and-forget (no wait, no retry, no error handling)
   * - In modalità sync (default): attende risposta con retry logic
   */
  protected async request<T = unknown>(
    method: HttpMethod,
    url: string | undefined,
    options?: RequestOptions
  ): Promise<T | undefined> {
    if (!url) return undefined;

    this.ensureHttpClient();

    const isAsync = this.mode === PluginMode.async;
    const requestOptions: RequestOptions = {
      ...options,
      fireAndForget: isAsync,
    };

    const result = await this.context!.http!.request<T>(method, url, requestOptions);
    return isAsync ? undefined : result;
  }
}