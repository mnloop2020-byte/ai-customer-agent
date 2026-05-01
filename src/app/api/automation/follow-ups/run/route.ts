import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { processDueFollowUps } from "@/lib/automation/follow-ups";
import { readOptionalJsonObject } from "@/lib/http/read-json";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const payload = await readOptionalJsonObject(request);
  const limit = typeof payload.limit === "number" && payload.limit > 0 ? payload.limit : 50;

  if (user) {
    const result = await processDueFollowUps({
      companyId: user.companyId,
      actorId: user.id,
      limit,
    });

    return NextResponse.json({
      mode: "session",
      ...result,
    });
  }

  const automationSecret = process.env.AUTOMATION_SECRET;
  const providedSecret = readAutomationSecret(request);

  if (!isValidAutomationSecret(providedSecret, automationSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companySlug = typeof payload.companySlug === "string" ? payload.companySlug.trim() : "";
  if (!companySlug) {
    return NextResponse.json({ error: "companySlug is required for secret automation runs." }, { status: 400 });
  }

  const company = await prisma.company.findUnique({
    where: { slug: companySlug },
    select: { id: true, slug: true },
  });

  if (!company) {
    return NextResponse.json({ error: "Company not found." }, { status: 404 });
  }

  const result = await processDueFollowUps({
    companyId: company.id,
    limit,
  });

  return NextResponse.json({
    mode: "secret",
    companySlug: company.slug,
    ...result,
  });
}

function readAutomationSecret(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  return request.headers.get("x-automation-secret")?.trim() ?? "";
}

function isValidAutomationSecret(providedSecret: string, automationSecret?: string) {
  if (!automationSecret || !providedSecret) return false;

  const provided = Buffer.from(providedSecret);
  const expected = Buffer.from(automationSecret);

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}
