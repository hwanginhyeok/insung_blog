"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useNeighborData } from "./_hooks/useNeighborData";
import { NeighborOverview } from "./_components/NeighborOverview";
import { RecentInteractions } from "./_components/RecentInteractions";
import { NeighborRecommendations } from "./_components/NeighborRecommendations";
import { RequestHistory } from "./_components/RequestHistory";
import { NeighborRequestForm } from "./_components/NeighborRequestForm";
import { NeighborActions } from "./_components/NeighborActions";
import { VisitResults } from "./_components/VisitResults";

const TABS = [
  { key: "overview", label: "현황" },
  { key: "results", label: "결과" },
  { key: "interactions", label: "교류" },
  { key: "requests", label: "신청" },
  { key: "recommend", label: "추천" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function NeighborPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const {
    stats,
    neighbors,
    requests,
    interactions,
    recommendations,
    loading,
    refresh,
  } = useNeighborData();

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">서로이웃 관리</h1>

      {/* 자동화 (이웃 찾기 / 방문) */}
      <NeighborActions onComplete={refresh} />

      {/* 통계 카드 */}
      <NeighborOverview stats={stats} />

      {/* 탭 네비게이션 */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tab) => (
          <Button
            key={tab.key}
            size="sm"
            variant={activeTab === tab.key ? "default" : "outline"}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* 탭 콘텐츠 */}
      {activeTab === "overview" && (
        <div className="space-y-4">
          {/* 이웃 목록 */}
          <div className="rounded-lg border">
            <div className="border-b px-4 py-3">
              <h3 className="text-sm font-medium">
                이웃 목록 ({neighbors.length}명)
              </h3>
            </div>
            {neighbors.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                등록된 이웃이 없습니다
              </div>
            ) : (
              <div className="divide-y">
                {neighbors.slice(0, 30).map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{n.blog_name || n.blog_id}</span>
                      {n.blog_name && (
                        <span className="text-muted-foreground text-xs">
                          {n.blog_id}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {n.category && (
                        <span className="text-xs text-muted-foreground">
                          {n.category}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          n.neighbor_type === "mutual"
                            ? "bg-green-100 text-green-700"
                            : n.neighbor_type === "one_way_following"
                              ? "bg-blue-100 text-blue-700"
                              : n.neighbor_type === "discovered"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {n.neighbor_type === "mutual"
                          ? "서로이웃"
                          : n.neighbor_type === "one_way_following"
                            ? "내가 추가"
                            : n.neighbor_type === "discovered"
                              ? "발견"
                              : "팔로워"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "results" && <VisitResults />}

      {activeTab === "interactions" && (
        <RecentInteractions interactions={interactions} />
      )}

      {activeTab === "requests" && (
        <div className="space-y-4">
          <NeighborRequestForm onSuccess={refresh} />
          <RequestHistory requests={requests} />
        </div>
      )}

      {activeTab === "recommend" && (
        <NeighborRecommendations
          recommendations={recommendations}
          onUpdate={refresh}
        />
      )}
    </div>
  );
}
