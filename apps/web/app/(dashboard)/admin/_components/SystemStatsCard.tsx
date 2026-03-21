"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SystemStats {
  users: {
    total: number;
    byTier: Record<string, number>;
    byStatus: Record<string, number>;
  };
  comments: {
    total: number;
    byStatus: Record<string, number>;
  };
  neighbors: {
    total: number;
    byType: Record<string, number>;
  };
  weekly: {
    bloggers: number;
    comments: number;
    failed: number;
    runs: number;
  };
}

interface Props {
  stats: SystemStats | null;
}

export function SystemStatsCard({ stats }: Props) {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            전체 사용자
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{stats.users.total}명</p>
          <p className="text-xs text-muted-foreground">
            F:{stats.users.byTier.free || 0} B:{stats.users.byTier.basic || 0} P:
            {stats.users.byTier.pro || 0}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            전체 댓글
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{stats.comments.total}건</p>
          <p className="text-xs text-muted-foreground">
            게시 {stats.comments.byStatus.posted || 0} / 실패{" "}
            {stats.comments.byStatus.failed || 0}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            전체 이웃
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{stats.neighbors.total}명</p>
          <p className="text-xs text-muted-foreground">
            서로이웃 {stats.neighbors.byType.mutual || 0}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            주간 실행
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{stats.weekly.runs}회</p>
          <p className="text-xs text-muted-foreground">
            방문 {stats.weekly.bloggers}명 / 댓글 {stats.weekly.comments}개
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
