import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

function getSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } }
  );
}

const VALID_COMMANDS = ["run", "execute", "retry"] as const;
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
  const { command } = body as { command: string };

  if (!command || !VALID_COMMANDS.includes(command as BotCommand)) {
    return NextResponse.json(
      { error: `유효하지 않은 명령: ${command}. 허용: ${VALID_COMMANDS.join(", ")}` },
      { status: 400 }
    );
  }

  // 중복 방지: 해당 사용자의 pending 또는 running 상태 명령이 있으면 거부
  const { data: active } = await supabase
    .from("bot_commands")
    .select("id, command, status")
    .eq("user_id", user.id)
    .in("status", ["pending", "running"])
    .limit(1)
    .single();

  if (active) {
    return NextResponse.json(
      {
        error: "이미 진행 중인 명령이 있습니다",
        activeCommand: active,
      },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("bot_commands")
    .insert({
      user_id: user.id,
      command,
      status: "pending",
    })
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
export async function GET() {
  const supabase = getSupabase();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { data: commands } = await supabase
    .from("bot_commands")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(5);

  // 현재 활성 명령 (pending 또는 running)
  const activeCommand = (commands || []).find(
    (c) => c.status === "pending" || c.status === "running"
  );

  return NextResponse.json({
    commands: commands || [],
    activeCommand: activeCommand || null,
  });
}
