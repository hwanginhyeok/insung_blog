import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-b from-stone-50 to-stone-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">인성이</CardTitle>
          <CardDescription>
            AI가 당신의 블로그 스타일을 학습하여<br />
            완벽한 글을 작성해드립니다
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Link href="/calendar">
            <Button className="w-full" size="lg">
              시작하기
            </Button>
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
