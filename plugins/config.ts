import { Plugin } from "@/types/plugin";
import { SlackNotifier } from "./slack-notifier";

const plugins: Plugin[] = [
  new SlackNotifier(),
];

export default plugins;