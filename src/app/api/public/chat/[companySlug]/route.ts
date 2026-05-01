import { NextResponse } from "next/server";
import { chatMessageSchema } from "@/domain/chat";
import { getCompanyProfileBySlug } from "@/lib/company-profile-db";
import { runAgentTurn } from "@/lib/agent/runtime";
import { prisma } from "@/lib/db";
import { checkRateLimit, getClientKey } from "@/lib/security/rate-limit";
import { getConversationForClient } from "@/lib/agent/memory";
import { readJsonBody } from "@/lib/http/read-json";

type RouteContext = {
  params: Promise<{
    companySlug: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const { companySlug } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const conversationId = searchParams.get("conversationId")?.trim();
  const visitorSessionId = searchParams.get("visitorSessionId")?.trim();

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  if (!visitorSessionId) {
    return NextResponse.json({ error: "visitorSessionId is required" }, { status: 400 });
  }

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const conversation = await getConversationForClient({
    conversationId,
    companyId: company.id,
    visitorSessionId,
  });

  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  return NextResponse.json({ conversation });
}

export async function POST(request: Request, context: RouteContext) {
  const { companySlug } = await context.params;
  const limit = checkRateLimit({
    key: getClientKey(request, `public-chat:${companySlug}`),
    limit: 30,
    windowMs: 60_000,
  });

  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many messages. Please wait a moment." }, { status: 429 });
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

  if (!parsed.data.visitorSessionId) {
    return NextResponse.json({ error: "visitorSessionId is required" }, { status: 400 });
  }

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const companyProfile = await getCompanyProfileBySlug(companySlug);
  const reply = await runAgentTurn({
    companyId: company.id,
    companyProfile,
    message: parsed.data,
  });

  return NextResponse.json({ reply });
}
