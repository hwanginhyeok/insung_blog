import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 방문자수 데이터 조회 (최근 30일)
  const { data: stats, error } = await supabase
    .from("blog_visitor_stats")
    .select("*")
    .eq("user_id", user.id)
    .order("date", { ascending: true })
    .limit(365);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ stats });
}
