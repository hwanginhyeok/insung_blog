"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type UserProfile = Database["public"]["Tables"]["users"]["Row"];

/**
 * 현재 로그인된 사용자의 프로필(users 테이블)을 가져오는 훅.
 * role 기반 접근 제어에 사용.
 */
export function useUser() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .single();

      setUser(data);
      setLoading(false);
    }

    fetchUser();
  }, []);

  return { user, loading, isAdmin: user?.role === "admin" };
}
