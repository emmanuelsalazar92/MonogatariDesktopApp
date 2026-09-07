import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandMark({ className, decorative = false }: { className?: string; decorative?: boolean }) {
  return (
    <Image
      src="/monogatari-mark.svg"
      alt={decorative ? "" : "Monogatari"}
      aria-hidden={decorative || undefined}
      width={48}
      height={48}
      className={cn("block shrink-0", className)}
    />
  );
}

export function BrandLockup({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2.5", className)}>
      <BrandMark decorative className={cn("size-9", markClassName)} />
      <span className="truncate font-serif text-[17px] font-semibold tracking-[-0.02em] text-foreground">Monogatari</span>
    </span>
  );
}
