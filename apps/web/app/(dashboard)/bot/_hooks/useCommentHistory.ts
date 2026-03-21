"use client";

import { useEffect, useState, useCallback } from "react";
import { PendingComment, apiFetchPendingHistory } from "../_lib/bot-api";

export interface CommentHistoryState {
  historyTab: string;
  history: PendingComment[];
  historyLoading: boolean;
  setHistoryTab: (tab: string) => void;
  fetchHistory: (status: string) => Promise<void>;
}

export function useCommentHistory(): CommentHistoryState {
  const [historyTab, setHistoryTab] = useState<string>("all");
  const [history, setHistory] = useState<PendingComment[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchHistory = useCallback(async (status: string) => {
    setHistoryLoading(true);
    try {
      const data = await apiFetchPendingHistory(status, 50);
      setHistory(data.comments || []);
    } catch {
      // 조회 실패 무시
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(historyTab);
  }, [historyTab, fetchHistory]);

  return {
    historyTab,
    history,
    historyLoading,
    setHistoryTab,
    fetchHistory,
  };
}
