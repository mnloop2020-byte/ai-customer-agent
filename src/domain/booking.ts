import { z } from "zod";

export const createBookingSchema = z.object({
  leadId: z.string().min(1),
  message: z.string().trim().min(2).max(1000),
  dueAt: z.coerce.date(),
});
