import { Suspense } from "react";
import { ExploreClient } from "./ExploreClient";
import { Spinner } from "@/components/ui/feedback";

export const dynamic = "force-dynamic";

export default function ExplorePage() {
  return (
    <Suspense
      fallback={
        <div className="container py-12">
          <Spinner />
        </div>
      }
    >
      <ExploreClient />
    </Suspense>
  );
}
