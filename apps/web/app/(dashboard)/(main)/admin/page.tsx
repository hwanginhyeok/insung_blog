"use client";

import { useEffect, useState, useCallback } from "react";
import { useUser } from "@/lib/hooks/use-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SystemStatsCard } from "./_components/SystemStatsCard";
import { UserDetailModal } from "./_components/UserDetailModal";

type Tier = "free" | "basic" | "pro";

const TIER_MAX: Record<Tier, number> = {
  free: 10,
  basic: 50,
  pro: 200,
};

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "user";
  tier: Tier;
  status: "active" | "suspended" | "pending";
  monthly_gen_count: number;
  gen_count_reset_month: string | null;
  created_at: string;
}

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

const TIER_OPTIONS: { value: Tier; label: string }[] = [
  { value: "free", label: "무료" },
  { value: "basic", label: "베이직" },
  { value: "pro", label: "프로" },
];

export default function AdminPage() {
  const { loading: authLoading, isAdmin } = useUser();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string } | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "사용자 목록 조회 실패");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setUsers(data.users);
    } catch {
      setError("네트워크 오류: 사용자 목록 조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/admin/stats");
    if (res.ok) {
      setSystemStats(await res.json());
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    fetchUsers();
    fetchStats();
  }, [authLoading, isAdmin, fetchUsers, fetchStats]);

  async function handleUpdate(
    userId: string,
    field: "tier" | "status",
    value: string
  ) {
    setUpdating(userId);
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, [field]: value }),
    });

    if (res.ok) {
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, [field]: value } : u))
      );
    }
    setUpdating(null);
  }

  function getUsage(u: UserRow) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const used =
      u.gen_count_reset_month === currentMonth ? u.monthly_gen_count : 0;
    const max = TIER_MAX[u.tier] ?? 10;
    return { used, max };
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">로딩 중...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-destructive font-medium">
          관리자 권한이 필요합니다
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">관리자</h1>

      {/* 시스템 전체 통계 */}
      <SystemStatsCard stats={systemStats} />

      {/* 사용자 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle>사용자 목록</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">이메일</th>
                  <th className="px-4 py-3 font-medium">이름</th>
                  <th className="px-4 py-3 font-medium">등급</th>
                  <th className="px-4 py-3 font-medium">사용량</th>
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="px-4 py-3 font-medium">가입일</th>
                  <th className="px-4 py-3 font-medium">상세</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const { used, max } = getUsage(u);
                  const isUpdating = updating === u.id;
                  return (
                    <tr
                      key={u.id}
                      className="border-b last:border-0 hover:bg-muted/50"
                    >
                      <td className="px-4 py-3 font-mono text-xs">
                        {u.email}
                      </td>
                      <td className="px-4 py-3">
                        {u.name || "-"}
                        {u.role === "admin" && (
                          <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                            관리자
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={u.tier}
                          onChange={(e) =>
                            handleUpdate(u.id, "tier", e.target.value)
                          }
                          disabled={isUpdating}
                          className="rounded border bg-background px-2 py-1 text-sm"
                        >
                          {TIER_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        <span
                          className={
                            used >= max
                              ? "text-destructive font-medium"
                              : ""
                          }
                        >
                          {used}/{max}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() =>
                            handleUpdate(
                              u.id,
                              "status",
                              u.status === "active" ? "suspended" : "active"
                            )
                          }
                          disabled={isUpdating}
                          className={`rounded px-2 py-0.5 text-xs font-medium ${
                            u.status === "active"
                              ? "bg-green-500/10 text-green-600"
                              : "bg-red-500/10 text-red-600"
                          }`}
                        >
                          {u.status === "active" ? "활성" : "정지"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString("ko-KR", {
                          month: "2-digit",
                          day: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setSelectedUser({
                              id: u.id,
                              name: u.name || u.email,
                            })
                          }
                        >
                          상세
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 사용자 상세 모달 */}
      {selectedUser && (
        <UserDetailModal
          userId={selectedUser.id}
          userName={selectedUser.name}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}
