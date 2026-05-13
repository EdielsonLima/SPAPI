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
      <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
        {/* Sidebar - hidden on mobile */}
        <div className="hidden md:flex">
          <Sidebar />
        </div>

        {/* Main content — scroll na coluna inteira pra o Header sticky pegar o blur do conteudo */}
        <div className="flex-1 overflow-y-auto">
          <Header />
          <main className="p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
