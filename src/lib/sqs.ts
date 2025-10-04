import {
  SQSClient,
  SendMessageCommand,
  SendMessageBatchCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  DeleteMessageBatchCommand,
  GetQueueAttributesCommand,
} from '@aws-sdk/client-sqs';

interface SqsService {
  sqs: SQSClient;
  commands: {
    SendMessageCommand: typeof SendMessageCommand;
    SendMessageBatchCommand: typeof SendMessageBatchCommand;
    ReceiveMessageCommand: typeof ReceiveMessageCommand;
    DeleteMessageCommand: typeof DeleteMessageCommand;
    DeleteMessageBatchCommand: typeof DeleteMessageBatchCommand;
    GetQueueAttributesCommand: typeof GetQueueAttributesCommand;
  };
}

const sqs = new SQSClient({});

const sqsService: SqsService = {
  sqs,
  commands: {
    SendMessageCommand,
    SendMessageBatchCommand,
    ReceiveMessageCommand,
    DeleteMessageCommand,
    DeleteMessageBatchCommand,
    GetQueueAttributesCommand,
  },
};

export default sqsService;
