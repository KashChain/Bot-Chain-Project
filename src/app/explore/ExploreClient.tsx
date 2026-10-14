"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AgentCard } from "@/components/AgentCard";
import { Input, Label, Select } from "@/components/ui/input";
import { Alert, Spinner } from "@/components/ui/feedback";
import { AGENT_CATEGORIES } from "@/lib/validation";
import type { PublicAgent } from "@/lib/agents/public";

type SortOption = "newest" | "name" | "price-asc" | "price-desc" | "rating" | "popularity";

export function ExploreClient() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const [category, setCategory] = useState(
    searchParams.get("category") ?? "all",
  );
  const [sort, setSort] = useState<SortOption>("newest");
  const [agents, setAgents] = useState<PublicAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      if (category !== "all") params.set("category", category);
      params.set("sort", sort);
      const response = await fetch(`/api/agents?${params.toString()}`);
      const payload = (await response.json()) as {
        agents?: PublicAgent[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load agents");
      }
      setAgents(payload.agents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, [search, category, sort]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void load();
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  return (
    <div className="container py-12">
      <h1 className="text-3xl font-bold">Explore agents</h1>
      <p className="mt-2 text-muted-foreground">
        Search, filter and sort available AI agents on AgentHub AI.
      </p>

      <div className="mt-8 grid gap-4 rounded-lg border border-border bg-card/60 p-5 md:grid-cols-[1fr_200px_200px]">
        <div className="space-y-2">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name, description or capability"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select
            id="category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="all">All categories</option>
            {AGENT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="sort">Sort by</Label>
          <Select
            id="sort"
            value={sort}
            onChange={(event) => setSort(event.target.value as SortOption)}
          >
            <option value="newest">Newest</option>
            <option value="rating">Top rated</option>
            <option value="popularity">Most used</option>
            <option value="name">Name (A-Z)</option>
            <option value="price-asc">Price (low to high)</option>
            <option value="price-desc">Price (high to low)</option>
          </Select>
        </div>
      </div>

      <div className="mt-8">
        {loading ? (
          <div className="flex items-center gap-3 text-muted-foreground">
            <Spinner /> Loading agents...
          </div>
        ) : error ? (
          <Alert tone="danger" title="Something went wrong">
            <p className="mt-1">{error}</p>
            <button
              type="button"
              onClick={() => void load()}
              className="mt-2 underline"
            >
              Retry
            </button>
          </Alert>
        ) : agents.length === 0 ? (
          <Alert tone="warning" title="No agents found">
            <p className="mt-1">
              Try a different search term or category, or register a new agent.
            </p>
          </Alert>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
