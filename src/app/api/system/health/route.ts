import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageCompanySettings } from "@/lib/auth/roles";
import { getSystemHealth } from "@/lib/system/health";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!canManageCompanySettings(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const health = await getSystemHealth(user.companyId);
  return NextResponse.json({ health });
}
