"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type QueueRow = Database["public"]["Tables"]["generation_queue"]["Row"];

const statusConfig = {
  pending: { label: "대기 중", color: "bg-yellow-100 text-yellow-800" },
  processing: { label: "생성 중", color: "bg-blue-100 text-blue-800" },
  completed: { label: "완료", color: "bg-green-100 text-green-800" },
  failed: { label: "실패", color: "bg-red-100 text-red-800" },
  cancelled: { label: "취소", color: "bg-stone-100 text-stone-600" },
};

export default function DashboardPage() {
  const [posts, setPosts] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPosts() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("generation_queue")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && data) {
        setPosts(data as QueueRow[]);
      }
      setLoading(false);
    }

    fetchPosts();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">내 글</h1>
          <p className="text-sm text-muted-foreground">
            AI와 함께 작성한 블로그 글 목록
          </p>
        </div>
        <Link href="/write">
          <Button>새 글 쓰기</Button>
        </Link>
      </div>

      {loading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <p className="text-muted-foreground">불러오는 중...</p>
          </CardContent>
        </Card>
      ) : posts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="mb-4 text-muted-foreground">
              아직 작성한 글이 없습니다
            </p>
            <Link href="/write">
              <Button>첫 번째 글 쓰기</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {posts.map((post) => {
            const status = statusConfig[post.status] || { label: post.status, color: "bg-stone-100 text-stone-600" };
            const categoryLabel = post.input_category || "자동";
            const dateStr = new Date(post.created_at).toLocaleDateString(
              "ko-KR",
              { year: "numeric", month: "long", day: "numeric" }
            );

            return (
              <Card
                key={post.id}
                className="transition-shadow hover:shadow-md"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-base">
                        {post.generated_title || "(제목 생성 중...)"}
                      </CardTitle>
                      <CardDescription>{dateStr}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {post.source === "telegram" && (
                        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                          TG
                        </span>
                      )}
                      <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
                        {categoryLabel}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.color}`}
                      >
                        {status.label}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                {post.status === "completed" && post.generated_body && (
                  <CardContent className="pt-0">
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {post.generated_body
                        .replace(/\[PHOTO_\d+\]/g, "")
                        .trim()
                        .slice(0, 150)}
                    </p>
                  </CardContent>
                )}
                {post.status === "failed" && post.error_message && (
                  <CardContent className="pt-0">
                    <p className="text-sm text-red-600">
                      {post.error_message}
                    </p>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
