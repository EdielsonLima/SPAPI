import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { SessionProvider } from "@/components/session-provider";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SessionProvider>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        {/* Sidebar - hidden on mobile */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
