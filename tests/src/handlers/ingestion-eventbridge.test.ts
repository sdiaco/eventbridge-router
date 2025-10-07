import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBridgeEvent } from 'aws-lambda';
import { handler } from '@/handlers/ingestion-eventbridge';
import * as sqsService from '@/services/sqs';

vi.mock('@/services/sqs');

describe('Ingestion EventBridge Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PRIMARY_QUEUE_URL = 'https://sqs.eu-west-1.amazonaws.com/123/test-queue';
  });

  const createMockEvent = (detail: unknown): EventBridgeEvent<string, unknown> => ({
    id: 'event-123',
    version: '0',
    account: '123456789012',
    time: '2025-01-01T12:00:00Z',
    region: 'eu-west-1',
    resources: ['arn:aws:resource:eu-west-1:123456789012:resource/123'],
    source: 'custom.events',
    'detail-type': 'User Created',
    detail,
  });

  describe('Configuration', () => {
    it('should throw error if PRIMARY_QUEUE_URL not configured', async () => {
      delete process.env.PRIMARY_QUEUE_URL;

      const event = createMockEvent({ userId: 123 });

      await expect(handler(event)).rejects.toThrow('PRIMARY_QUEUE_URL not configured');
    });
  });

  describe('Event Processing', () => {
    it('should queue EventBridge event to SQS', async () => {
      vi.spyOn(sqsService, 'sendMessageBatch').mockResolvedValue(undefined);

      const event = createMockEvent({ userId: 123, email: 'user@example.com' });

      await handler(event);

      expect(sqsService.sendMessageBatch).toHaveBeenCalledWith({
        QueueUrl: 'https://sqs.eu-west-1.amazonaws.com/123/test-queue',
        Entries: [
          {
            Id: '0',
            MessageBody: JSON.stringify({
              id: 'event-123',
              name: 'User Created',
              source: 'custom.events',
              data: { userId: 123, email: 'user@example.com' },
              timestamp: new Date('2025-01-01T12:00:00Z'),
              attributes: {
                region: 'eu-west-1',
                account: '123456789012',
                resources: ['arn:aws:resource:eu-west-1:123456789012:resource/123'],
              },
            }),
          },
        ],
      });
    });

    it('should transform EventBridge event to PluginEvent format', async () => {
      vi.spyOn(sqsService, 'sendMessageBatch').mockResolvedValue(undefined);

      const detail = { orderId: 456, total: 99.99 };
      const event = createMockEvent(detail);

      await handler(event);

      const sentMessage = JSON.parse(
        (sqsService.sendMessageBatch as any).mock.calls[0][0].Entries[0].MessageBody
      );

      expect(sentMessage).toMatchObject({
        id: 'event-123',
        name: 'User Created',
        source: 'custom.events',
        data: detail,
        attributes: {
          region: 'eu-west-1',
          account: '123456789012',
        },
      });
      expect(sentMessage.timestamp).toBeDefined();
    });

    it('should throw error if SQS fails', async () => {
      vi.spyOn(sqsService, 'sendMessageBatch').mockRejectedValue(new Error('SQS Error'));

      const event = createMockEvent({ test: 'data' });

      await expect(handler(event)).rejects.toThrow('SQS Error');
    });
  });

  describe('Event Attributes', () => {
    it('should include EventBridge metadata in attributes', async () => {
      vi.spyOn(sqsService, 'sendMessageBatch').mockResolvedValue(undefined);

      const event = createMockEvent({ data: 'test' });

      await handler(event);

      const sentMessage = JSON.parse(
        (sqsService.sendMessageBatch as any).mock.calls[0][0].Entries[0].MessageBody
      );

      expect(sentMessage.attributes).toMatchObject({
        region: 'eu-west-1',
        account: '123456789012',
        resources: ['arn:aws:resource:eu-west-1:123456789012:resource/123'],
      });
    });
  });
});
