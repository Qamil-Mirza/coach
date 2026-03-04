import { cn } from "@/lib/cn";

export function Spotlight({ className }: { className?: string }) {
  return (
    <div className={cn("spotlight", className)} aria-hidden>
      <span className="spotlight-blob spotlight-blob-a" />
      <span className="spotlight-blob spotlight-blob-b" />
      <span className="spotlight-grid" />
    </div>
  );
}
