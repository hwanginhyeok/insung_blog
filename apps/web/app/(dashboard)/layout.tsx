import { Header } from "@/components/nav/header";
import { OnboardingDialog } from "@/components/onboarding-dialog";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>{children}</main>
      <OnboardingDialog />
    </div>
  );
}
