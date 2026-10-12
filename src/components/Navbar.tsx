"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { WalletConnect } from "@/components/wallet/WalletConnect";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Marketplace" },
  { href: "/explore", label: "Explore" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/register", label: "Register agent" },
  { href: "/docs", label: "Docs" },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-primary to-accent text-sm font-bold text-primary-foreground">
            AH
          </span>
          <span className="text-base font-semibold">
            AgentHub<span className="gradient-text"> AI</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm transition-colors hover:bg-secondary/60",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:block">
          <WalletConnect />
        </div>

        <button
          type="button"
          className="md:hidden"
          aria-label="Toggle navigation"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open ? (
        <div className="border-t border-border md:hidden">
          <div className="container flex flex-col gap-1 py-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60"
              >
                {link.label}
              </Link>
            ))}
            <div className="px-3 pt-2">
              <WalletConnect />
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
