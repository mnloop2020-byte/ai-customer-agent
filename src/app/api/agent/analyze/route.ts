import { NextResponse } from "next/server";
import { analyzeIncomingMessage, incomingMessageSchema } from "@/domain/agent";
import { getCurrentUser } from "@/lib/auth/session";
import { getCompanyProfile } from "@/lib/company-profile-db";
import { generateAgentReply } from "@/lib/ai/provider";
import { classifySemanticIntent } from "@/lib/ai/semantic-intent-classifier";
import { planAgentTools } from "@/lib/agent/tools";
import { readJsonBody } from "@/lib/http/read-json";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await readJsonBody(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = incomingMessageSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid incoming message", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const companyProfile = await getCompanyProfile(user.companyId);
  const semanticIntent = await classifySemanticIntent({
    customerMessage: parsed.data.body,
    conversationHistory: parsed.data.conversationHistory,
    currentStage: parsed.data.leadSnapshot?.buyingStage,
    agentMemory: parsed.data.leadSnapshot?.agentMemory,
  });
  const decision = analyzeIncomingMessage({ ...parsed.data, companyProfile, semanticIntent });
  const generated = await generateAgentReply({
    customerMessage: parsed.data.body,
    companyProfile,
    decision,
  });

  return NextResponse.json({
    decision: {
      ...decision,
      response: generated.text,
      aiProvider: generated.provider,
      toolCalls: planAgentTools(decision),
    },
  });
}
