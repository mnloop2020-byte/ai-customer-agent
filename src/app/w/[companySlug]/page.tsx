import { notFound } from "next/navigation";
import { getCompanyProfileBySlug } from "@/lib/company-profile-db";
import ClientPublicPage from "./client-page";

type WidgetPageProps = {
  params: Promise<{ companySlug: string }>;
};

export default async function WidgetPage({ params }: WidgetPageProps) {
  const { companySlug } = await params;
  try {
    await getCompanyProfileBySlug(companySlug);
  } catch {
    notFound();
  }
  return <ClientPublicPage />;
}