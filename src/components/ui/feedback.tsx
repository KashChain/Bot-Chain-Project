import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "warning" | "danger" | "info";

const tones: Record<Tone, string> = {
  default: "border-border bg-secondary text-secondary-foreground",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  danger: "border-red-500/40 bg-red-500/10 text-red-300",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-300",
};

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Alert({
  className,
  tone = "info",
  title,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: Tone; title?: string }) {
  return (
    <div
      role="alert"
      className={cn("rounded-md border p-3 text-sm", tones[tone], className)}
      {...props}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      aria-hidden
    />
  );
}
