import { Plugin, PluginContext, PluginEvent } from "@/types/plugins";
import { SlackWebhookPayload } from "./types";
import { HttpClient } from "@services/fetch";

export class SlackNotifier implements Plugin {
  name = 'slack-notifier';
  events = ['user.created', 'order.placed']; // eventi da gestire
  metadata = {
    version: '1.0.0',
    description: 'Sends slack notification on event received',
    owner: 'eventbridge-router',
  };

  private client: HttpClient;

  constructor() {
    this.client = new HttpClient({
      timeoutMs: 5000,
      maxRetries: 2,
    });
  }

  async onEvent(event: PluginEvent, context: PluginContext): Promise<void> {
    const payload: SlackWebhookPayload = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `Event: ${event.name}`,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Source:*\n${event.source}`,
            },
            {
              type: "mrkdwn",
              text: `*Event Name:*\n${event.name}`,
            },
          ],
        },
      ],
    };

    await this.client.post('***TEST***', {
      body: payload,
    });

  }
}