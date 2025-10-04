import type { IHttpClient } from './fetch';

export enum PluginMode {
  async,
  sync
} 

export interface Plugin {
  name: string;
  mode?: PluginMode;
  events?: string[] | ((eventName: string) => boolean);
  init?: (context: PluginContext) => Promise<void> | void;
  destroy?: () => Promise<void> | void;
  onEvent?: (event: PluginEvent, context: PluginContext) => Promise<void> | void;
  onReplay?: (event: PluginEvent, context: PluginContext) => Promise<void> | void;
  onDLQ?: (event: PluginEvent, context: PluginContext) => Promise<void> | void;
  onError?: (error: Error, event: PluginEvent, context: PluginContext) => Promise<void> | void;
  metadata?: PluginMetadata;
}

export interface PluginMetadata {
  version: string;
  description: string;
  owner: string;
  avgDurationMs?: number; // durata media osservata
  maxDurationMs?: number; // worst case scenario
  executionStrategy?: 'inline' | 'worker'; // default: inline (auto-detected se non specificato)
}

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

export interface MetricsCollector {
  increment(metric: string, value?: number): void;
  gauge(metric: string, value: number): void;
  timing(metric: string, value: number): void;
}

export interface PluginContext {
  emit: (event: PluginEvent) => void;
  config: Record<string, unknown>;
  logger: Logger;
  http?: IHttpClient;
  metrics?: MetricsCollector;
}

export interface PluginEvent<T = unknown> {
  id?: string;
  name: string;
  source: string;
  data: T;
  timestamp?: Date;
}