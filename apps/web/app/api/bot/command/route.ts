import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase-admin";

function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
}

const VALID_COMMANDS = ["run", "execute", "retry", "publish", "extract_blog_id", "neighbor_request", "discover_neighbors", "visit_neighbors", "discover_and_visit"] as const;
type BotCommand = (typeof VALID_COMMANDS)[number];

/**
 * POST /api/bot/command
 * 봇 명령 등록 (run | execute | retry)
 * 중복 방지: pending/running 상태 명령이 있으면 409
 */
export async function POST(req: NextRequest) {
  const supabase = getSupabase();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await req.json();
  const { command, payload } = body as { command: string; payload?: Record<string, unknown> };

  if (!command || !VALID_COMMANDS.includes(command as BotCommand)) {
    return NextResponse.json(
      { error: `유효하지 않은 명령: ${command}. 허용: ${VALID_COMMANDS.join(", ")}` },
      { status: 400 }
    );
  }

  // publish 명령은 payload 필수
  if (command === "publish" && (!payload || !payload.title || !payload.body)) {
    return NextResponse.json(
      { error: "publish 명령에는 payload(title, body)가 필요합니다" },
      { status: 400 }
    );
  }

  // 중복 방지: 해당 사용자의 pending 또는 running 상태 명령이 있으면 거부
  const admin = createAdminClient();
  const { data: active } = await admin
    .from("bot_commands")
    .select("id, command, status")
    .eq("user_id", user.id)
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle();

  if (active) {
    return NextResponse.json(
      {
        error: "이미 진행 중인 명령이 있습니다",
        activeCommand: active,
      },
      { status: 409 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertData: Record<string, any> = {
    user_id: user.id,
    command,
    status: "pending",
  };
  if (payload) {
    insertData.payload = payload;
  }

  const { data, error } = await admin
    .from("bot_commands")
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error("명령 등록 실패:", error);
    return NextResponse.json({ error: "명령 등록 실패" }, { status: 500 });
  }

  return NextResponse.json({ success: true, command: data });
}

/**
 * GET /api/bot/command
 * 최근 명령 5개 조회 (폴링용)
 */
export async function GET(req: NextRequest) {
  const supabase = getSupabase();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit")) || 5,
    50
  );
  const commandFilter = req.nextUrl.searchParams.get("commands");

  const admin = createAdminClient();
  let query = admin
    .from("bot_commands")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (commandFilter) {
    query = query.in("command", commandFilter.split(","));
  }

  query = query.limit(limit);

  const { data: commands } = await query;

  // 현재 활성 명령 (pending 또는 running)
  const activeCommand = (commands || []).find(
    (c) => c.status === "pending" || c.status === "running"
  );

  return NextResponse.json({
    commands: commands || [],
    activeCommand: activeCommand || null,
  });
}
