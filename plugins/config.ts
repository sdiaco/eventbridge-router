import { Plugin } from "@/types/plugins";
import { SlackNotifier } from "./slack-notifier";

const plugins: Plugin[] = [
  new SlackNotifier(),
];

export default plugins;