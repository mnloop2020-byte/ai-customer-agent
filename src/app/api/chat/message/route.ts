import { NextResponse } from "next/server";
import { chatMessageSchema } from "@/domain/chat";
import { getCurrentUser } from "@/lib/auth/session";
import { getCompanyProfile } from "@/lib/company-profile-db";
import { runAgentTurn } from "@/lib/agent/runtime";
import { getConversationForClient } from "@/lib/agent/memory";
import { readJsonBody } from "@/lib/http/read-json";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const conversationId = new URL(request.url).searchParams.get("conversationId")?.trim();

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  const conversation = await getConversationForClient({
    conversationId,
    companyId: user.companyId,
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  return NextResponse.json({ conversation });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await readJsonBody(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = chatMessageSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid chat message", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const companyProfile = await getCompanyProfile(user.companyId);
  const reply = await runAgentTurn({
    companyId: user.companyId,
    companyProfile,
    message: parsed.data,
  });

  return NextResponse.json({ reply });
}
