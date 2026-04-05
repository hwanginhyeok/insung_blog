import Link from "next/link";

/** 404 커스텀 페이지 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="text-center space-y-4">
        <h1 className="text-6xl font-bold text-primary">404</h1>
        <h2 className="text-xl font-semibold text-foreground">
          페이지를 찾을 수 없습니다
        </h2>
        <p className="text-muted-foreground max-w-md">
          요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.
        </p>
        <Link
          href="/write"
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}
