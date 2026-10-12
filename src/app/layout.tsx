import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { WalletProvider } from "@/components/wallet/WalletProvider";

export const metadata: Metadata = {
  title: "AgentHub AI — AI Agent Marketplace on BOT Chain",
  description:
    "Discover, delegate and verify AI agents. Pay per task on BOT Chain Testnet with verifiable on-chain receipts.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <WalletProvider>
          <div className="flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </WalletProvider>
      </body>
    </html>
  );
}
