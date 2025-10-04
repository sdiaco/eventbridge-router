import {
  EventBridgeClient,
  PutEventsCommand,
  PutRuleCommand,
  PutTargetsCommand,
  ListRulesCommand,
} from '@aws-sdk/client-eventbridge';

interface EventBridgeService {
  client: EventBridgeClient;
  commands: {
    PutEventsCommand: typeof PutEventsCommand;
    PutRuleCommand: typeof PutRuleCommand;
    PutTargetsCommand: typeof PutTargetsCommand;
    ListRulesCommand: typeof ListRulesCommand;
  };
}

const client = new EventBridgeClient({});

const eventBridgeService: EventBridgeService = {
  client,
  commands: {
    PutEventsCommand,
    PutRuleCommand,
    PutTargetsCommand,
    ListRulesCommand,
  },
};

export default eventBridgeService;
