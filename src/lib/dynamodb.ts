import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  BatchGetCommand,
} from '@aws-sdk/lib-dynamodb';

interface DynamoDBService {
  client: DynamoDBClient;
  docClient: DynamoDBDocumentClient;
  commands: {
    PutCommand: typeof PutCommand;
    GetCommand: typeof GetCommand;
    QueryCommand: typeof QueryCommand;
    UpdateCommand: typeof UpdateCommand;
    DeleteCommand: typeof DeleteCommand;
    BatchGetCommand: typeof BatchGetCommand;
  };
}

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const dynamoDBService: DynamoDBService = {
  client,
  docClient,
  commands: {
    PutCommand,
    GetCommand,
    QueryCommand,
    UpdateCommand,
    DeleteCommand,
    BatchGetCommand,
  },
};

export default dynamoDBService;
