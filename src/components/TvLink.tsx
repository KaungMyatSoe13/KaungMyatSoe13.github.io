"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { tvOff } from "@/lib/tv";

/** A link that switches pages with the old-TV power-off / power-on. */
export default function TvLink({ href, className, children }: { href: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        router.prefetch(href);
        tvOff(() => router.push(href));
      }}
    >
      {children}
    </Link>
  );
}
