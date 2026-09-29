"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type SearchFilters = Record<string, string | undefined>;

export function RealtimeDocumentSearch({
  filters,
  initialValue,
  path,
}: {
  filters: SearchFilters;
  initialValue: string;
  path: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (value === initialValue) return;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams();
      for (const [key, filterValue] of Object.entries(filters)) {
        if (filterValue && key !== "search" && key !== "page") {
          params.set(key, filterValue);
        }
      }
      const search = value.trim();
      if (search) params.set("search", search);
      const query = params.toString();
      startTransition(() => {
        router.replace(query ? `${path}?${query}` : path, { scroll: false });
      });
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [filters, initialValue, path, router, value]);

  return (
    <label className="text-sm font-semibold text-neutral-900">
      Recherche
      <span className="relative mt-1 block">
        <input
          aria-busy={pending}
          className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white px-3 pr-9 text-sm text-neutral-900"
          name="search"
          onChange={(event) => setValue(event.target.value)}
          placeholder="N°, client ou montant"
          type="search"
          value={value}
        />
        {pending ? (
          <span
            aria-label="Recherche en cours"
            className="absolute right-3 top-1/2 size-3 -translate-y-1/2 animate-spin rounded-full border-2 border-primary-200 border-t-primary-700"
            role="status"
          />
        ) : null}
      </span>
    </label>
  );
}
