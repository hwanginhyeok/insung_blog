import { Header } from "@/components/nav/header";
import { OnboardingDialog } from "@/components/onboarding-dialog";
import { FeedbackPanel } from "@/components/FeedbackPanel";
import { Toaster } from "@/components/ui/toast";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Toaster>
      <div className="min-h-screen bg-background">
        <Header />
        <main>{children}</main>
        <OnboardingDialog />
        <FeedbackPanel />
      </div>
    </Toaster>
  );
}
