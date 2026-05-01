import { NextResponse } from "next/server";
import { companyProfileSchema } from "@/domain/company";
import { getCurrentUser } from "@/lib/auth/session";
import { getCompanyProfile } from "@/lib/company-profile-db";
import { prisma } from "@/lib/db";
import { readJsonBody } from "@/lib/http/read-json";
import { canManageCompanySettings } from "@/lib/auth/roles";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await getCompanyProfile(user.companyId);

  return NextResponse.json({ profile });
}

export async function PUT(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageCompanySettings(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = await readJsonBody(request);
  if (!payload) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = companyProfileSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid company profile", issues: parsed.error.flatten() }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: user.companyId },
      data: {
        name: parsed.data.name,
        industry: parsed.data.industry,
        description: parsed.data.description,
        location: parsed.data.location,
        workingHours: parsed.data.workingHours,
        aiPersona: parsed.data.tone,
        handoffRules: parsed.data.handoffRule.split("\n").filter(Boolean),
      },
    });

    await tx.service.deleteMany({ where: { companyId: user.companyId } });

    if (parsed.data.services.length) {
      await tx.service.createMany({
        data: parsed.data.services.map((service) => ({
          companyId: user.companyId,
          name: service.name,
          description: service.description,
          priceLabel: service.price,
        })),
      });
    }
  });

  const profile = await getCompanyProfile(user.companyId);

  return NextResponse.json({ profile });
}
