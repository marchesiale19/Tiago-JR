import { Collection, type ChatInputCommandInteraction } from "discord.js";
import * as postular from "./postular";

export interface BotCommand {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export const commands: Collection<string, BotCommand> = new Collection();
commands.set(postular.data.name, postular);
