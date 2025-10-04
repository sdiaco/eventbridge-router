import { Logger, MetricsCollector } from './plugin';
import { IHttpClient } from './fetch';

export interface PluginManagerOptions {
  logger: Logger;
  http?: IHttpClient;
  metrics?: MetricsCollector;
  config?: Record<string, Record<string, unknown>>;
}
