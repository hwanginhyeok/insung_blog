"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  updateRecommendation,
  sendNeighborRequest,
  type NeighborRecommendation,
} from "../_lib/neighbor-api";

interface Props {
  recommendations: NeighborRecommendation[];
  onUpdate: () => void;
}

export function NeighborRecommendations({ recommendations, onUpdate }: Props) {
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  async function handleApply(rec: NeighborRecommendation) {
    setProcessing((prev) => new Set(prev).add(rec.id));
    try {
      const result = await sendNeighborRequest(rec.blog_id, rec.blog_name || undefined);
      if (result.success) {
        await updateRecommendation(rec.id, "applied");
        onUpdate();
      }
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(rec.id);
        return next;
      });
    }
  }

  async function handleDismiss(id: string) {
    setProcessing((prev) => new Set(prev).add(id));
    try {
      await updateRecommendation(id, "dismissed");
      onUpdate();
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>이웃 추천</CardTitle>
      </CardHeader>
      <CardContent>
        {recommendations.length === 0 ? (
          <p className="text-sm text-muted-foreground">추천 목록이 없습니다</p>
        ) : (
          <div className="space-y-2">
            {recommendations.map((rec) => (
              <div
                key={rec.id}
                className="flex items-center justify-between rounded border px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {rec.blog_name || rec.blog_id}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {rec.category && (
                      <span className="mr-2">{rec.category}</span>
                    )}
                    {rec.reason}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    onClick={() => handleApply(rec)}
                    disabled={processing.has(rec.id)}
                  >
                    신청
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDismiss(rec.id)}
                    disabled={processing.has(rec.id)}
                  >
                    무시
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
