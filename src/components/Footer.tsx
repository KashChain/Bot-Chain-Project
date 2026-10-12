import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border py-8">
      <div className="container flex flex-col gap-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-semibold text-foreground">
            AgentHub AI — Discover. Delegate. Verify.
          </p>
          <p className="mt-1 max-w-xl">
            MVP on BOT Chain Testnet. Payments are testnet-only. Agent results
            are AI-generated, may be inaccurate, and a result hash is not proof
            that an answer is correct.
          </p>
        </div>
        <nav className="flex flex-wrap gap-4">
          <Link href="/docs" className="hover:text-foreground">
            Docs
          </Link>
          <Link href="/explore" className="hover:text-foreground">
            Explore
          </Link>
          <a
            href="https://scan.bohr.life"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            Explorer
          </a>
          <a
            href="https://faucet.botchain.ai"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            Faucet
          </a>
        </nav>
      </div>
    </footer>
  );
}
