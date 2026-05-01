import { z } from "zod";

export const inboxReplySchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
});

export const conversationActionSchema = z.object({
  conversationId: z.string().min(1),
  action: z.enum(["close", "escalate", "reopen"]),
});
