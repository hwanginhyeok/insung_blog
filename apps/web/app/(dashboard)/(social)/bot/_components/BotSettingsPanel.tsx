"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ChevronDown } from "lucide-react";
import {
  BotSettings,
  CookieStatus,
  DEFAULT_PROMPT_PLACEHOLDER,
} from "../_lib/bot-api";

interface BotSettingsPanelProps {
  settingsDraft: BotSettings;
  settingsSaving: boolean;
  cookieStatus: CookieStatus | null;
  onDraftChange: React.Dispatch<React.SetStateAction<BotSettings>>;
  onSave: () => void;
}

export function BotSettingsPanel({
  settingsDraft,
  settingsSaving,
  cookieStatus,
  onDraftChange,
  onSave,
}: BotSettingsPanelProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setSettingsOpen((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>설정</CardTitle>
            {!settingsOpen && (
              <p className="mt-1 text-sm text-muted-foreground">
                {settingsDraft.naver_blog_id || "블로그 미설정"} |{" "}
                {settingsDraft.approval_mode === "manual" ? "수동 승인" : "자동"} | 평일{" "}
                {settingsDraft.weekday_hours.start}~{settingsDraft.weekday_hours.end}시
              </p>
            )}
          </div>
          <ChevronDown
            className={`h-5 w-5 text-muted-foreground transition-transform duration-200 ${
              settingsOpen ? "rotate-180" : ""
            }`}
          />
        </div>
      </CardHeader>
      {settingsOpen && (
        <CardContent className="space-y-4">
          {/* 블로그 ID 미설정 안내 */}
          {!settingsDraft.naver_blog_id && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              봇을 실행하려면 먼저 &quot;내 네이버 블로그 ID&quot;를 설정해야 합니다.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="naver-blog-id" className="text-sm font-medium">내 네이버 블로그 ID</label>
              <Input
                id="naver-blog-id"
                placeholder="예: youyoubear0517"
                value={settingsDraft.naver_blog_id || ""}
                onChange={(e) =>
                  onDraftChange((s) => ({
                    ...s,
                    naver_blog_id: e.target.value || null,
                  }))
                }
                className="mt-1 w-64"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                blog.naver.com/<strong>여기ID</strong> 형식의 블로그 주소에서 확인
                {settingsDraft.naver_blog_id && cookieStatus?.hasCookies && (
                  <span className="ml-2 text-primary font-medium">
                    &#10003; 자동 감지: {settingsDraft.naver_blog_id}
                  </span>
                )}
              </p>
            </div>

            <div>
              <label htmlFor="approval-mode" className="text-sm font-medium">모드</label>
              <select
                id="approval-mode"
                className="mt-1 block w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={settingsDraft.approval_mode}
                onChange={(e) =>
                  onDraftChange((s) => ({ ...s, approval_mode: e.target.value }))
                }
              >
                <option value="manual">수동 승인</option>
                <option value="auto">자동</option>
              </select>
            </div>

            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={settingsDraft.is_active}
                  onChange={(e) =>
                    onDraftChange((s) => ({ ...s, is_active: e.target.checked }))
                  }
                  className="rounded"
                />
                봇 활성화
              </label>
            </div>

            <div>
              <label className="text-sm font-medium">평일 시간대</label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={24}
                  value={settingsDraft.weekday_hours.start}
                  onChange={(e) =>
                    onDraftChange((s) => ({
                      ...s,
                      weekday_hours: { ...s.weekday_hours, start: Number(e.target.value) },
                    }))
                  }
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">시 ~</span>
                <Input
                  type="number"
                  min={0}
                  max={24}
                  value={settingsDraft.weekday_hours.end}
                  onChange={(e) =>
                    onDraftChange((s) => ({
                      ...s,
                      weekday_hours: { ...s.weekday_hours, end: Number(e.target.value) },
                    }))
                  }
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">시</span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">주말 시간대</label>
              <div className="mt-1 flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={24}
                  value={settingsDraft.weekend_hours.start}
                  onChange={(e) =>
                    onDraftChange((s) => ({
                      ...s,
                      weekend_hours: { ...s.weekend_hours, start: Number(e.target.value) },
                    }))
                  }
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">시 ~</span>
                <Input
                  type="number"
                  min={0}
                  max={24}
                  value={settingsDraft.weekend_hours.end}
                  onChange={(e) =>
                    onDraftChange((s) => ({
                      ...s,
                      weekend_hours: { ...s.weekend_hours, end: Number(e.target.value) },
                    }))
                  }
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">시</span>
              </div>
            </div>

            <div>
              <label htmlFor="max-bloggers" className="text-sm font-medium">일일 블로거 한도</label>
              <Input
                id="max-bloggers"
                type="number"
                min={1}
                max={50}
                value={settingsDraft.max_bloggers_per_day}
                onChange={(e) =>
                  onDraftChange((s) => ({
                    ...s,
                    max_bloggers_per_day: Number(e.target.value),
                  }))
                }
                className="mt-1 w-32"
              />
            </div>

            <div>
              <label htmlFor="max-comments" className="text-sm font-medium">일일 댓글 한도</label>
              <Input
                id="max-comments"
                type="number"
                min={1}
                max={100}
                value={settingsDraft.max_comments_per_day}
                onChange={(e) =>
                  onDraftChange((s) => ({
                    ...s,
                    max_comments_per_day: Number(e.target.value),
                  }))
                }
                className="mt-1 w-32"
              />
            </div>
          </div>

          {/* 이웃 신청 설정 */}
          <div className="space-y-3 rounded-lg border p-4">
            <h3 className="text-sm font-semibold">이웃 신청</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={settingsDraft.auto_neighbor_request ?? false}
                    onChange={(e) =>
                      onDraftChange((s) => ({
                        ...s,
                        auto_neighbor_request: e.target.checked,
                      }))
                    }
                    className="rounded"
                  />
                  방문 시 자동 이웃 신청
                </label>
              </div>

              <div>
                <label htmlFor="max-neighbor-requests" className="text-sm font-medium">일일 신청 한도</label>
                <Input
                  id="max-neighbor-requests"
                  type="number"
                  min={1}
                  max={30}
                  value={settingsDraft.max_neighbor_requests_per_day ?? 10}
                  onChange={(e) =>
                    onDraftChange((s) => ({
                      ...s,
                      max_neighbor_requests_per_day: Number(e.target.value),
                    }))
                  }
                  className="mt-1 w-32"
                  disabled={!settingsDraft.auto_neighbor_request}
                />
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="neighbor-message" className="text-sm font-medium">신청 메시지</label>
                <Textarea
                  id="neighbor-message"
                  placeholder="안녕하세요! 글이 좋아서 서로이웃 신청드립니다 :)"
                  rows={2}
                  value={settingsDraft.neighbor_request_message || ""}
                  onChange={(e) =>
                    onDraftChange((s) => ({
                      ...s,
                      neighbor_request_message: e.target.value || null,
                    }))
                  }
                  className="mt-1 text-sm"
                  disabled={!settingsDraft.auto_neighbor_request}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  비워두면 기본 메시지로 신청합니다.
                </p>
              </div>
            </div>
          </div>

          {/* 댓글 스타일 프롬프트 */}
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="comment-prompt" className="text-sm font-medium">댓글 스타일 프롬프트</label>
              {settingsDraft.comment_prompt && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs text-muted-foreground"
                  onClick={() => onDraftChange((s) => ({ ...s, comment_prompt: null }))}
                >
                  기본값 복원
                </Button>
              )}
            </div>
            <Textarea
              id="comment-prompt"
              placeholder={DEFAULT_PROMPT_PLACEHOLDER}
              rows={10}
              value={settingsDraft.comment_prompt || ""}
              onChange={(e) =>
                onDraftChange((s) => ({
                  ...s,
                  comment_prompt: e.target.value || null,
                }))
              }
              className="mt-1 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              비워두면 기본 프롬프트를 사용합니다. AI가 댓글을 생성할 때 이 규칙을 따릅니다.
            </p>
          </div>

          <Button onClick={onSave} disabled={settingsSaving}>
            {settingsSaving ? "저장 중..." : "설정 저장"}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
