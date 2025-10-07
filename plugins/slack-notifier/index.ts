import { PluginContext, PluginEvent, PluginMode } from "@/types/plugin";
import { SlackWebhookPayload } from "./types";
import { PluginBase } from "@/core/plugin-base";

export class SlackNotifier extends PluginBase {
  name = 'slack-notifier';
  mode = PluginMode.async;
  events = ['test.slack.notify'];
  metadata = {
    version: '1.0.0',
    description: 'Sends slack notification on event received',
    owner: 'eventbridge-router',
  };

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

    await this.request('POST', '***TEST***', {
      body: payload,
      timeoutMs: 5000,
    });

  }
}