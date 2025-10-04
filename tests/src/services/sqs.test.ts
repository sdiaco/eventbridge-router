/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendMessage, receiveMessages, deleteMessage, sendMessageBatch, deleteMessageBatch, getQueueAttributes } from '@/services/sqs';
import type { SendMessageParameters, ReceiveMessageParameters, DeleteMessageParameters } from '@/types/sqs';

// Mock del modulo lib/sqs
const mockSend = vi.fn();
vi.mock('@/lib/sqs', () => {
  return {
    default: {
      sqs: {
        send: vi.fn(),
      },
      commands: {
        SendMessageCommand: vi.fn(),
        SendMessageBatchCommand: vi.fn(),
        ReceiveMessageCommand: vi.fn(),
        DeleteMessageCommand: vi.fn(),
        DeleteMessageBatchCommand: vi.fn(),
        GetQueueAttributesCommand: vi.fn(),
      },
    },
  };
});

// Import the mocked module to get access to the mock
import sqsLib from '@/lib/sqs';

describe('SQS Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
    (sqsLib.sqs.send as any) = mockSend;
  });

  describe('sendMessage', () => {
    it('should send message successfully', async () => {
      const params: SendMessageParameters = {
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
        MessageBody: JSON.stringify({ test: 'data' }),
      };

      mockSend.mockResolvedValueOnce({ MessageId: 'msg-123' });

      const messageId = await sendMessage(params);

      expect(messageId).toBe('msg-123');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error if QueueUrl is missing', async () => {
      const params: SendMessageParameters = {
        QueueUrl: '',
        MessageBody: 'test',
      };

      await expect(sendMessage(params)).rejects.toThrow('QueueUrl is required');
    });

    it('should throw error if MessageBody is missing', async () => {
      const params: SendMessageParameters = {
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
        MessageBody: '',
      };

      await expect(sendMessage(params)).rejects.toThrow('MessageBody is required');
    });

    it('should handle AWS SDK errors', async () => {
      const params: SendMessageParameters = {
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
        MessageBody: 'test',
      };

      mockSend.mockRejectedValueOnce(new Error('AWS Error'));

      await expect(sendMessage(params)).rejects.toThrow('Error sending message to SQS: AWS Error');
    });
  });

  describe('sendMessageBatch', () => {
    it('should send batch messages successfully', async () => {
      const params = {
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
        Entries: [
          { Id: '1', MessageBody: 'msg1' },
          { Id: '2', MessageBody: 'msg2' },
        ],
      };

      mockSend.mockResolvedValueOnce({ Successful: [{ Id: '1' }, { Id: '2' }], Failed: [] });

      await sendMessageBatch(params);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error if batch has failures', async () => {
      const params = {
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
        Entries: [
          { Id: '1', MessageBody: 'msg1' },
          { Id: '2', MessageBody: 'msg2' },
        ],
      };

      mockSend.mockResolvedValueOnce({
        Failed: [{ Id: '1', Message: 'Failed to send' }],
      });

      await expect(sendMessageBatch(params)).rejects.toThrow('Failed to send 1 messages');
    });

    it('should throw error if Entries is empty', async () => {
      const params = {
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
        Entries: [],
      };

      await expect(sendMessageBatch(params)).rejects.toThrow('Entries are required');
    });
  });

  describe('receiveMessages', () => {
    it('should receive messages successfully', async () => {
      const params: ReceiveMessageParameters = {
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
        MaxNumberOfMessages: 5,
      };

      const mockMessages = [
        { MessageId: 'msg-1', Body: 'test1', ReceiptHandle: 'handle-1' },
        { MessageId: 'msg-2', Body: 'test2', ReceiptHandle: 'handle-2' },
      ];

      mockSend.mockResolvedValueOnce({ Messages: mockMessages });

      const messages = await receiveMessages(params);

      expect(messages).toHaveLength(2);
      expect(messages[0].MessageId).toBe('msg-1');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return empty array if no messages', async () => {
      const params: ReceiveMessageParameters = {
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
      };

      mockSend.mockResolvedValueOnce({ Messages: undefined });

      const messages = await receiveMessages(params);

      expect(messages).toEqual([]);
    });

    it('should throw error if QueueUrl is missing', async () => {
      const params: ReceiveMessageParameters = {
        QueueUrl: '',
      };

      await expect(receiveMessages(params)).rejects.toThrow('QueueUrl is required');
    });

    it('should use default MaxNumberOfMessages if not provided', async () => {
      const params: ReceiveMessageParameters = {
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
      };

      mockSend.mockResolvedValueOnce({ Messages: [] });

      await receiveMessages(params);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteMessage', () => {
    it('should delete message successfully', async () => {
      const params: DeleteMessageParameters = {
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
        ReceiptHandle: 'handle-123',
      };

      mockSend.mockResolvedValueOnce({});

      await deleteMessage(params);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error if QueueUrl is missing', async () => {
      const params: DeleteMessageParameters = {
        QueueUrl: '',
        ReceiptHandle: 'handle-123',
      };

      await expect(deleteMessage(params)).rejects.toThrow('QueueUrl is required');
    });

    it('should throw error if ReceiptHandle is missing', async () => {
      const params: DeleteMessageParameters = {
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
        ReceiptHandle: '',
      };

      await expect(deleteMessage(params)).rejects.toThrow('ReceiptHandle is required');
    });
  });

  describe('deleteMessageBatch', () => {
    it('should delete batch messages successfully', async () => {
      const params = {
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
        Entries: [
          { Id: '1', ReceiptHandle: 'handle-1' },
          { Id: '2', ReceiptHandle: 'handle-2' },
        ],
      };

      mockSend.mockResolvedValueOnce({ Successful: [{ Id: '1' }, { Id: '2' }], Failed: [] });

      await deleteMessageBatch(params);

      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should throw error if batch has failures', async () => {
      const params = {
        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
        Entries: [
          { Id: '1', ReceiptHandle: 'handle-1' },
          { Id: '2', ReceiptHandle: 'handle-2' },
        ],
      };

      mockSend.mockResolvedValueOnce({
        Failed: [{ Id: '1', Message: 'Failed to delete' }],
      });

      await expect(deleteMessageBatch(params)).rejects.toThrow('Failed to delete 1 messages');
    });
  });

  describe('getQueueAttributes', () => {
    it('should get queue attributes successfully', async () => {
      const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';
      const mockAttributes = {
        ApproximateNumberOfMessages: '10',
        ApproximateNumberOfMessagesNotVisible: '2',
      };

      mockSend.mockResolvedValueOnce({ Attributes: mockAttributes });

      const attributes = await getQueueAttributes(queueUrl);

      expect(attributes).toEqual(mockAttributes);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('should return empty object if no attributes', async () => {
      const queueUrl = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

      mockSend.mockResolvedValueOnce({ Attributes: undefined });

      const attributes = await getQueueAttributes(queueUrl);

      expect(attributes).toEqual({});
    });

    it('should throw error if QueueUrl is missing', async () => {
      await expect(getQueueAttributes('')).rejects.toThrow('QueueUrl is required');
    });
  });
});
