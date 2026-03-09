/** 블로그 카테고리 — 캘린더, 페르소나, AI 생성에서 공통 사용 */
export const BLOG_CATEGORIES = ["맛집", "카페", "여행", "일상", "기타"] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];
