"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SearchBar({
  initialValue = "",
  placeholder = "Search agents, categories or capabilities...",
}: {
  initialValue?: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue);

  return (
    <form
      className="flex w-full gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams();
        if (value.trim()) params.set("search", value.trim());
        router.push(`/explore${params.toString() ? `?${params}` : ""}`);
      }}
    >
      <div className="relative flex-1">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          className="pl-9"
          aria-label="Search agents"
        />
      </div>
      <Button type="submit">Search</Button>
    </form>
  );
}
