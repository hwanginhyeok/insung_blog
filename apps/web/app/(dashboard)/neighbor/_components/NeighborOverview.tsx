"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { NeighborStats } from "../_lib/neighbor-api";

interface Props {
  stats: NeighborStats | null;
}

export function NeighborOverview({ stats }: Props) {
  if (!stats) return null;

  const { neighbors, requests, interactions } = stats;

  return (
    <div className="grid gap-4 sm:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            서로이웃
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{neighbors.byType.mutual}명</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            일방 이웃
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">
            {neighbors.byType.one_way_following}명
          </p>
          <p className="text-xs text-muted-foreground">내가 추가</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            전체 이웃
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{neighbors.total}명</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            교류 기록
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{interactions.total}건</p>
          <p className="text-xs text-muted-foreground">
            신청 {requests.total}건 (수락 {requests.byStatus.accepted})
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
