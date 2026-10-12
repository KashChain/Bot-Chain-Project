import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function shortAddress(address?: string | null, size = 4): string {
  if (!address) return "";
  if (address.length <= size * 2 + 2) return address;
  return `${address.slice(0, size + 2)}...${address.slice(-size)}`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export function formatToken(wei: string, decimals = 18, maxFraction = 4): string {
  try {
    const value = BigInt(wei);
    const base = BigInt(10) ** BigInt(decimals);
    const whole = value / base;
    const fraction = value % base;
    if (fraction === BigInt(0)) return whole.toString();
    const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, maxFraction);
    return `${whole}.${fractionStr}`.replace(/0+$/, "").replace(/\.$/, "");
  } catch {
    return wei;
  }
}
