import { NextResponse } from "next/server";
import { getCompanyProfileBySlug } from "@/lib/company-profile-db";

type RouteContext = {
  params: Promise<{
    companySlug: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { companySlug } = await context.params;

  try {
    const profile = await getCompanyProfileBySlug(companySlug);
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }
}
