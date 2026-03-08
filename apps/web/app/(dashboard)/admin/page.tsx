"use client";

import { useEffect, useState, useCallback } from "react";
import { useUser } from "@/lib/hooks/use-user";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

const TIER_OPTIONS: { value: Tier; label: string }[] = [
  { value: "free", label: "무료" },
  { value: "basic", label: "베이직" },
  { value: "pro", label: "프로" },
];

export default function AdminPage() {
  const { user: currentUser, loading: authLoading, isAdmin } = useUser();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "사용자 목록 조회 실패");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setUsers(data.users);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    fetchUsers();
  }, [authLoading, isAdmin, fetchUsers]);

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

  // 현재 월 사용량 계산 (월 전환 시 0으로 표시)
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

  // 통계 계산
  const totalUsers = users.length;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const totalGenThisMonth = users.reduce((sum, u) => {
    const used =
      u.gen_count_reset_month === currentMonth ? u.monthly_gen_count : 0;
    return sum + used;
  }, 0);
  const tierDist = users.reduce(
    (acc, u) => {
      acc[u.tier] = (acc[u.tier] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">관리자</h1>

      {/* 통계 카드 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              전체 사용자
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalUsers}명</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              이번 달 생성
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalGenThisMonth}건</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              티어 분포
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold">
              F:{tierDist.free || 0} B:{tierDist.basic || 0} P:
              {tierDist.pro || 0}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 사용자 테이블 */}
      <Card>
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
