import { Plugin } from "@/types/plugin";
import { SlackNotifier } from "./sample-slack-notifier";

const plugins: Plugin[] = [
  new SlackNotifier(),
];

export default plugins;