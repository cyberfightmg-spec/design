import type { Context, SessionFlavor } from 'grammy';

export interface SessionData {
  state: 'idle' | 'waiting_photo' | 'selecting_styles' | 'processing';
  projectId: string | null;
  selectedStyleIds: string[];
}

export type BotContext = Context & SessionFlavor<SessionData>;
