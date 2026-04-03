"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { BLOG_CATEGORIES } from "@/lib/constants";

// ── 타입 ──

interface CalendarEvent {
  id: string;
  planned_date: string;
  topic: string;
  category: string | null;
  memo: string | null;
  status: string;
  generation_id: string | null;
  created_at: string;
}

interface CompletedPost {
  id: string;
  generated_title: string;
  status: string;
  created_at: string;
}

const CATEGORIES = BLOG_CATEGORIES;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const STATUS_COLORS: Record<string, string> = {
  planned: "bg-gray-200 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  published: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600 line-through",
};

const STATUS_LABELS: Record<string, string> = {
  planned: "예정",
  in_progress: "작성 중",
  published: "발행 완료",
  cancelled: "취소",
};

// ── 유틸 ──

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ── 메인 페이지 ──

export default function CalendarPage() {
  const router = useRouter();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [posts, setPosts] = useState<CompletedPost[]>([]);
  const [loading, setLoading] = useState(true);

  // 모달 상태
  const [modalDate, setModalDate] = useState<string | null>(null);
  const [editEvent, setEditEvent] = useState<CalendarEvent | null>(null);
  const [formTopic, setFormTopic] = useState("");
  const [formCategory, setFormCategory] = useState<string | null>(null);
  const [formMemo, setFormMemo] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // ── 데이터 로드 ──

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/calendar?year=${year}&month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
        setPosts(data.posts || []);
      }
    } catch {
      // 로드 실패 무시
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── 월 이동 ──

  function prevMonth() {
    if (month === 1) {
      setYear(year - 1);
      setMonth(12);
    } else {
      setMonth(month - 1);
    }
  }

  function nextMonth() {
    if (month === 12) {
      setYear(year + 1);
      setMonth(1);
    } else {
      setMonth(month + 1);
    }
  }

  // ── 모달: 새 이벤트 ──

  function openNewModal(date: string) {
    setModalDate(date);
    setEditEvent(null);
    setFormTopic("");
    setFormCategory(null);
    setFormMemo("");
  }

  // ── 모달: 기존 이벤트 편집 ──

  function openEditModal(event: CalendarEvent) {
    setModalDate(event.planned_date);
    setEditEvent(event);
    setFormTopic(event.topic);
    setFormCategory(event.category);
    setFormMemo(event.memo || "");
  }

  function closeModal() {
    setModalDate(null);
    setEditEvent(null);
  }

  // ── 저장 ──

  async function handleSave() {
    if (!formTopic.trim() || !modalDate) return;
    setIsSaving(true);

    try {
      if (editEvent) {
        // 수정
        await fetch("/api/calendar", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editEvent.id,
            topic: formTopic.trim(),
            category: formCategory,
            memo: formMemo || null,
          }),
        });
      } else {
        // 생성
        await fetch("/api/calendar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planned_date: modalDate,
            topic: formTopic.trim(),
            category: formCategory,
            memo: formMemo || null,
          }),
        });
      }

      closeModal();
      await loadData();
    } catch {
      // 저장 실패 무시
    } finally {
      setIsSaving(false);
    }
  }

  // ── 삭제 ──

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function handleDelete() {
    if (!editEvent) return;
    setShowDeleteConfirm(false);
    await fetch(`/api/calendar?id=${editEvent.id}`, { method: "DELETE" });
    closeModal();
    await loadData();
  }

  // ── 상태 변경 ──

  async function handleStatusChange(eventId: string, newStatus: string) {
    await fetch("/api/calendar", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: eventId, status: newStatus }),
    });
    await loadData();
  }

  // ── 글쓰기 시작 ──

  function startWriting(event: CalendarEvent) {
    const params = new URLSearchParams();
    params.set("calendar_id", event.id);
    if (event.topic) params.set("topic", event.topic);
    if (event.category) params.set("category", event.category);
    router.push(`/write?${params.toString()}`);
  }

  // ── 캘린더 그리드 데이터 ──

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const todayStr = formatDate(
    today.getFullYear(),
    today.getMonth() + 1,
    today.getDate()
  );

  // 날짜별 이벤트 매핑
  const eventsByDate: Record<string, CalendarEvent[]> = {};
  for (const event of events) {
    const date = event.planned_date;
    if (!eventsByDate[date]) eventsByDate[date] = [];
    eventsByDate[date].push(event);
  }

  // 날짜별 완료 글 매핑
  const postsByDate: Record<string, CompletedPost[]> = {};
  for (const post of posts) {
    const date = post.created_at.split("T")[0];
    if (!postsByDate[date]) postsByDate[date] = [];
    postsByDate[date].push(post);
  }

  // ── 렌더 ──

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">콘텐츠 캘린더</h1>
        <p className="text-sm text-muted-foreground">
          주제를 미리 계획하고 발행 일정을 관리하세요
        </p>
      </div>

      {/* 월 네비게이션 */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={prevMonth}>
          &larr; 이전
        </Button>
        <h2 className="text-lg font-semibold">
          {year}년 {month}월
        </h2>
        <Button variant="outline" size="sm" onClick={nextMonth}>
          다음 &rarr;
        </Button>
      </div>

      {/* 캘린더 그리드 */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <p className="text-muted-foreground">로딩 중...</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {WEEKDAYS.map((day, i) => (
                      <th
                        key={day}
                        className={`border-b px-2 py-2 text-center text-sm font-medium ${
                          i === 0
                            ? "text-red-500"
                            : i === 6
                              ? "text-blue-500"
                              : "text-muted-foreground"
                        }`}
                      >
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows: React.ReactNode[] = [];
                    let dayCounter = 1;

                    for (let week = 0; week < 6; week++) {
                      if (dayCounter > daysInMonth) break;

                      const cells: React.ReactNode[] = [];
                      for (let dow = 0; dow < 7; dow++) {
                        if (week === 0 && dow < firstDay) {
                          cells.push(
                            <td
                              key={`empty-${dow}`}
                              className="border-b p-1 align-top"
                            />
                          );
                        } else if (dayCounter > daysInMonth) {
                          cells.push(
                            <td
                              key={`empty-end-${dow}`}
                              className="border-b p-1 align-top"
                            />
                          );
                        } else {
                          const day = dayCounter;
                          const dateStr = formatDate(year, month, day);
                          const dayEvents = eventsByDate[dateStr] || [];
                          const dayPosts = postsByDate[dateStr] || [];
                          const isToday = dateStr === todayStr;

                          cells.push(
                            <td
                              key={day}
                              className={`border-b p-1 align-top min-h-[80px] min-w-[100px] cursor-pointer hover:bg-secondary/30 transition-colors ${
                                isToday ? "bg-primary/5" : ""
                              }`}
                              onClick={() => openNewModal(dateStr)}
                            >
                              <div className="p-1">
                                <span
                                  className={`text-sm font-medium ${
                                    isToday
                                      ? "rounded-full bg-primary px-1.5 py-0.5 text-primary-foreground"
                                      : dow === 0
                                        ? "text-red-500"
                                        : dow === 6
                                          ? "text-blue-500"
                                          : ""
                                  }`}
                                >
                                  {day}
                                </span>

                                {/* 이벤트 배지 */}
                                <div className="mt-1 space-y-0.5">
                                  {dayEvents.map((event) => (
                                    <button
                                      key={event.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openEditModal(event);
                                      }}
                                      className={`block w-full truncate rounded px-1 py-0.5 text-left text-xs ${
                                        STATUS_COLORS[event.status] ||
                                        STATUS_COLORS.planned
                                      }`}
                                    >
                                      {event.topic}
                                    </button>
                                  ))}
                                  {dayPosts
                                    .filter(
                                      (p) =>
                                        !dayEvents.some(
                                          (e) => e.generation_id === p.id
                                        )
                                    )
                                    .map((post) => (
                                      <button
                                        key={post.id}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          router.push(`/write?id=${post.id}`);
                                        }}
                                        className="block w-full truncate rounded bg-emerald-50 px-1 py-0.5 text-left text-xs text-emerald-700 hover:bg-emerald-100 transition-colors"
                                      >
                                        {post.generated_title || "제목 없음"}
                                      </button>
                                    ))}
                                </div>
                              </div>
                            </td>
                          );

                          dayCounter++;
                        }
                      }

                      rows.push(<tr key={week}>{cells}</tr>);
                    }

                    return rows;
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 이벤트 모달 */}
      {modalDate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={closeModal}
        >
          <Card
            className="w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader>
              <CardTitle className="text-base">
                {editEvent ? "일정 수정" : "새 일정 추가"}
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {modalDate}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 주제 */}
              <div>
                <label className="mb-1 block text-sm font-medium">주제</label>
                <Input
                  placeholder="오늘 뭘 쓸까요?"
                  value={formTopic}
                  onChange={(e) => setFormTopic(e.target.value)}
                />
              </div>

              {/* 카테고리 */}
              <div>
                <label className="mb-1 block text-sm font-medium">
                  카테고리
                </label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => (
                    <Button
                      key={cat}
                      variant={formCategory === cat ? "default" : "outline"}
                      size="sm"
                      onClick={() =>
                        setFormCategory(formCategory === cat ? null : cat)
                      }
                    >
                      {cat}
                    </Button>
                  ))}
                </div>
              </div>

              {/* 메모 */}
              <div>
                <label className="mb-1 block text-sm font-medium">메모</label>
                <Textarea
                  placeholder="메모 (선택사항)"
                  value={formMemo}
                  onChange={(e) => setFormMemo(e.target.value)}
                  rows={2}
                />
              </div>

              {/* 상태 변경 (수정 모드) */}
              {editEvent && (
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    상태
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(STATUS_LABELS).map(([key, label]) => (
                      <Button
                        key={key}
                        variant={
                          editEvent.status === key ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() =>
                          handleStatusChange(editEvent.id, key)
                        }
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* 버튼 */}
              <div className="flex gap-2 justify-end">
                {editEvent && (
                  <>
                    {editEvent.generation_id ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          router.push(`/write?id=${editEvent.generation_id}`)
                        }
                      >
                        글 보기
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startWriting(editEvent)}
                      >
                        글쓰기 시작
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      삭제
                    </Button>
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={closeModal}>
                  닫기
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!formTopic.trim() || isSaving}
                >
                  {isSaving
                    ? "저장 중..."
                    : editEvent
                      ? "수정"
                      : "추가"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        title="일정 삭제"
        description="이 일정을 삭제하시겠습니까?"
        confirmLabel="삭제"
        variant="danger"
      />
    </div>
  );
}
