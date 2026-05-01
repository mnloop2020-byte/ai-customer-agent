import { notFound } from "next/navigation";
import { WebChat } from "@/components/web-chat";
import { getCompanyProfileBySlug } from "@/lib/company-profile-db";

type WidgetPageProps = {
  params: Promise<{
    companySlug: string;
  }>;
};

export default async function WidgetPage({ params }: WidgetPageProps) {
  const { companySlug } = await params;

  try {
    await getCompanyProfileBySlug(companySlug);
  } catch {
    notFound();
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#eef4f7] px-3 py-3 sm:px-5 sm:py-5">
      <div className="mx-auto w-full max-w-7xl">
        <WebChat
          endpoint={`/api/public/chat/${companySlug}`}
          profileEndpoint={`/api/public/company/${companySlug}`}
          showInsights={false}
          fullHeight
        />
      </div>
    </main>
  );
}
