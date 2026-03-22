"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { sendNeighborRequest } from "../_lib/neighbor-api";

interface Props {
  onSuccess: () => void;
}

export function NeighborRequestForm({ onSuccess }: Props) {
  const [blogId, setBlogId] = useState("");
  const [blogName, setBlogName] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!blogId.trim()) return;

    setSending(true);
    setResult(null);

    const res = await sendNeighborRequest(
      blogId.trim(),
      blogName.trim() || undefined,
      message.trim() || undefined
    );

    if (res.success) {
      setResult({ type: "ok", text: "서로이웃 신청 명령이 전송되었습니다" });
      setBlogId("");
      setBlogName("");
      setMessage("");
      onSuccess();
    } else {
      setResult({ type: "err", text: res.error || "신청 실패" });
    }

    setSending(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>수동 이웃 신청</CardTitle>
        <CardDescription>
          블로그 ID를 입력하여 서로이웃을 신청합니다
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium">블로그 ID *</label>
              <Input
                placeholder="예: youyoubear0517"
                value={blogId}
                onChange={(e) => setBlogId(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">블로그 이름</label>
              <Input
                placeholder="선택사항"
                value={blogName}
                onChange={(e) => setBlogName(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">신청 메시지</label>
            <Textarea
              placeholder="서로이웃 신청 시 보낼 메시지 (선택사항)"
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={sending || !blogId.trim()}>
              {sending ? "전송 중..." : "서로이웃 신청"}
            </Button>
            {result && (
              <span
                className={`text-sm ${result.type === "ok" ? "text-green-600" : "text-red-500"}`}
              >
                {result.text}
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
