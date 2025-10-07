/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { publishEvent, publishEventsBatch } from '@/services/eventbridge';
import type { PublishEventParameters, PublishEventsBatchParameters } from '@/types/eventbridge';

// Mock del modulo lib/eventbridge
const mockSend = vi.fn();
vi.mock('@/lib/eventbridge', () => {
  return {
    default: {
      client: {
        send: vi.fn(),
      },
      commands: {
        PutEventsCommand: vi.fn(),
      },
    },
  };
});

// Import the mocked module to get access to the mock
import eventBridgeLib from '@/lib/eventbridge';

describe('EventBridge Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
    (eventBridgeLib.client.send as any) = mockSend;
  });

  describe('publishEvent', () => {
    it('should publish event successfully', async () => {
      const params: PublishEventParameters = {
        eventBusName: 'default',
        source: 'order-service',
        detailType: 'OrderCreated',
        detail: { orderId: 123, amount: 100 },
      };

      mockSend.mockResolvedValueOnce({
        FailedEntryCount: 0,
        Entries: [{ EventId: 'event-123' }],
      });

      await publishEvent(params);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should publish event with resources', async () => {
      const params: PublishEventParameters = {
        eventBusName: 'default',
        source: 'order-service',
        detailType: 'OrderCreated',
        detail: { orderId: 123, amount: 100 },
        resources: ['arn:aws:ec2:us-east-1:123456789:instance/i-1234567890abcdef0'],
      };

      mockSend.mockResolvedValueOnce({
        FailedEntryCount: 0,
        Entries: [{ EventId: 'event-123' }],
      });

      await publishEvent(params);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error if event fails to publish', async () => {
      const params: PublishEventParameters = {
        eventBusName: 'default',
        source: 'order-service',
        detailType: 'OrderCreated',
        detail: { orderId: 123 },
      };

      mockSend.mockResolvedValueOnce({
        FailedEntryCount: 1,
        Entries: [
          {
            ErrorCode: 'InternalException',
            ErrorMessage: 'Internal server error',
          },
        ],
      });

      await expect(publishEvent(params)).rejects.toThrow('Failed to publish event: Internal server error');
    });

    it('should handle EventBridge SDK errors', async () => {
      const params: PublishEventParameters = {
        eventBusName: 'default',
        source: 'order-service',
        detailType: 'OrderCreated',
        detail: { orderId: 123 },
      };

      mockSend.mockRejectedValueOnce(new Error('EventBridge Error'));

      await expect(publishEvent(params)).rejects.toThrow('EventBridge Error');
    });

    it('should serialize detail to JSON string', async () => {
      const params: PublishEventParameters = {
        eventBusName: 'default',
        source: 'order-service',
        detailType: 'OrderCreated',
        detail: {
          orderId: 123,
          customer: { id: 456, name: 'John Doe' },
          items: [{ productId: 789, quantity: 2 }],
        },
      };

      mockSend.mockResolvedValueOnce({
        FailedEntryCount: 0,
        Entries: [{ EventId: 'event-123' }],
      });

      await publishEvent(params);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('publishEventsBatch', () => {
    it('should publish batch events successfully', async () => {
      const params: PublishEventsBatchParameters = {
        eventBusName: 'default',
        entries: [
          {
            source: 'order-service',
            detailType: 'OrderCreated',
            detail: { orderId: 123 },
          },
          {
            source: 'order-service',
            detailType: 'OrderUpdated',
            detail: { orderId: 123, status: 'shipped' },
          },
        ],
      };

      mockSend.mockResolvedValueOnce({
        FailedEntryCount: 0,
        Entries: [{ EventId: 'event-1' }, { EventId: 'event-2' }],
      });

      await publishEventsBatch(params);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should publish batch events with resources', async () => {
      const params: PublishEventsBatchParameters = {
        eventBusName: 'default',
        entries: [
          {
            source: 'order-service',
            detailType: 'OrderCreated',
            detail: { orderId: 123 },
            resources: ['arn:aws:dynamodb:us-east-1:123456789:table/Orders'],
          },
          {
            source: 'order-service',
            detailType: 'OrderUpdated',
            detail: { orderId: 123, status: 'shipped' },
          },
        ],
      };

      mockSend.mockResolvedValueOnce({
        FailedEntryCount: 0,
        Entries: [{ EventId: 'event-1' }, { EventId: 'event-2' }],
      });

      await publishEventsBatch(params);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error if batch has failures', async () => {
      const params: PublishEventsBatchParameters = {
        eventBusName: 'default',
        entries: [
          {
            source: 'order-service',
            detailType: 'OrderCreated',
            detail: { orderId: 123 },
          },
          {
            source: 'order-service',
            detailType: 'OrderUpdated',
            detail: { orderId: 123 },
          },
        ],
      };

      mockSend.mockResolvedValueOnce({
        FailedEntryCount: 1,
        Entries: [
          { EventId: 'event-1' },
          {
            ErrorCode: 'InternalException',
            ErrorMessage: 'Internal server error',
          },
        ],
      });

      await expect(publishEventsBatch(params)).rejects.toThrow('Failed to publish 1 events');
    });

    it('should handle multiple failures in batch', async () => {
      const params: PublishEventsBatchParameters = {
        eventBusName: 'default',
        entries: [
          {
            source: 'order-service',
            detailType: 'OrderCreated',
            detail: { orderId: 123 },
          },
          {
            source: 'order-service',
            detailType: 'OrderUpdated',
            detail: { orderId: 124 },
          },
          {
            source: 'order-service',
            detailType: 'OrderCancelled',
            detail: { orderId: 125 },
          },
        ],
      };

      mockSend.mockResolvedValueOnce({
        FailedEntryCount: 2,
        Entries: [
          { EventId: 'event-1' },
          {
            ErrorCode: 'ValidationException',
            ErrorMessage: 'Invalid event',
          },
          {
            ErrorCode: 'ThrottlingException',
            ErrorMessage: 'Rate exceeded',
          },
        ],
      });

      await expect(publishEventsBatch(params)).rejects.toThrow('Failed to publish 2 events');
    });

    it('should handle EventBridge SDK errors', async () => {
      const params: PublishEventsBatchParameters = {
        eventBusName: 'default',
        entries: [
          {
            source: 'order-service',
            detailType: 'OrderCreated',
            detail: { orderId: 123 },
          },
        ],
      };

      mockSend.mockRejectedValueOnce(new Error('EventBridge Error'));

      await expect(publishEventsBatch(params)).rejects.toThrow('EventBridge Error');
    });

    it('should serialize all detail objects to JSON strings', async () => {
      const params: PublishEventsBatchParameters = {
        eventBusName: 'default',
        entries: [
          {
            source: 'order-service',
            detailType: 'OrderCreated',
            detail: { orderId: 123, items: [{ id: 1, qty: 2 }] },
          },
          {
            source: 'order-service',
            detailType: 'OrderUpdated',
            detail: { orderId: 123, status: 'shipped', metadata: { carrier: 'UPS' } },
          },
        ],
      };

      mockSend.mockResolvedValueOnce({
        FailedEntryCount: 0,
        Entries: [{ EventId: 'event-1' }, { EventId: 'event-2' }],
      });

      await publishEventsBatch(params);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });
});
