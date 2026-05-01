import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getCompanyProfile } from "@/lib/company-profile-db";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const profile = await getCompanyProfile(user.companyId);

  return NextResponse.json({ authenticated: true, user, profile });
}

