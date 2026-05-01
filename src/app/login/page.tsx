import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) redirect("/");

  const userCount = await prisma.user.count();

  return <LoginForm initialNeedsSetup={userCount === 0} />;
}
