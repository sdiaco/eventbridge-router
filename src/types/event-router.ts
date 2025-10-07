/**
 * Configurazione per EventRouter
 */
export interface EventRouterConfig {
  eventsTableName: string;
  dlqUrl?: string;
  batchSize?: number;
  ttlDays?: number;
}
