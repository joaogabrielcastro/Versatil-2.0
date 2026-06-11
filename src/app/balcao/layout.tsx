import { BalcaoNav } from "@/components/balcao/balcao-nav";

export default function BalcaoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <BalcaoNav />
      {children}
    </div>
  );
}
