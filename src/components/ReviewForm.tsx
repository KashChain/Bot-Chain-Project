"use client";

import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { Alert, Spinner } from "@/components/ui/feedback";
import { useWallet } from "@/components/wallet/WalletProvider";

interface PublicTaskSummary {
  id: string;
  agentSlug: string;
  status: string;
}

export function ReviewForm({ agentSlug }: { agentSlug: string }) {
  const { sessionAddress, signingIn, signIn } = useWallet();
  const [tasks, setTasks] = useState<PublicTaskSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [taskId, setTaskId] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const loadTasks = useCallback(async () => {
    if (!sessionAddress) return;
    setLoading(true);
    try {
      const response = await fetch("/api/tasks");
      const payload = (await response.json()) as {
        tasks?: PublicTaskSummary[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to load your tasks");
      }
      const completed = (payload.tasks ?? []).filter(
        (task) => task.status === "COMPLETED" && task.agentSlug === agentSlug,
      );
      setTasks(completed);
      if (completed.length > 0) setTaskId(completed[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load your tasks");
    } finally {
      setLoading(false);
    }
  }, [sessionAddress, agentSlug]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, rating, comment: comment.trim() || undefined }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to submit review");
      }
      setDone(true);
      setMessage("Thanks! Your review has been recorded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <Alert tone="success" title="Review submitted">
        <p className="mt-1">{message}</p>
      </Alert>
    );
  }

  if (!sessionAddress) {
    return (
      <div className="rounded-lg border border-border bg-card/60 p-4">
        <p className="text-sm text-muted-foreground">
          Sign in with the wallet that completed a task to leave a review.
        </p>
        <Button
          className="mt-3"
          size="sm"
          variant="outline"
          onClick={signIn}
          disabled={signingIn}
        >
          {signingIn ? "Signing in..." : "Sign in to review"}
        </Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner /> Loading your completed tasks...
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Complete a task with this agent to leave a review.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card/60 p-4">
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="review-task">Completed task</Label>
          <Select
            id="review-task"
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
          >
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.id.slice(0, 10)}... ({task.status})
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="review-rating">Rating</Label>
          <Select
            id="review-rating"
            value={String(rating)}
            onChange={(event) => setRating(Number(event.target.value))}
          >
            {[5, 4, 3, 2, 1].map((value) => (
              <option key={value} value={value}>
                {"★".repeat(value)}
                {"☆".repeat(5 - value)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="review-comment">Comment (optional)</Label>
          <Textarea
            id="review-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="How did this agent perform?"
          />
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Button onClick={submit} disabled={submitting || !taskId}>
          {submitting ? "Submitting..." : "Submit review"}
          <Star size={14} className="ml-1" />
        </Button>
      </div>
    </div>
  );
}
