/**
 * Supabase 테이블 타입 정의.
 * 수동 작성 — 스키마 변경 시 함께 업데이트 필요.
 * TODO: supabase gen types 자동화 연결
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string | null;
          role: "admin" | "user";
          status: "active" | "suspended" | "pending";
          tier: "free" | "basic" | "pro";
          monthly_gen_count: number;
          gen_count_reset_month: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name?: string | null;
          role?: "admin" | "user";
          status?: "active" | "suspended" | "pending";
          tier?: "free" | "basic" | "pro";
          monthly_gen_count?: number;
          gen_count_reset_month?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string | null;
          role?: "admin" | "user";
          status?: "active" | "suspended" | "pending";
          tier?: "free" | "basic" | "pro";
          monthly_gen_count?: number;
          gen_count_reset_month?: string | null;
          updated_at?: string;
        };
      };
      user_credentials: {
        Row: {
          id: string;
          user_id: string;
          naver_id_encrypted: string | null;
          naver_pw_encrypted: string | null;
          blog_id: string;
          assigned_worker: string;
          cookies: Json;
          cookies_updated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          naver_id_encrypted?: string | null;
          naver_pw_encrypted?: string | null;
          blog_id: string;
          assigned_worker?: string;
          cookies?: Json;
          cookies_updated_at?: string | null;
        };
        Update: {
          naver_id_encrypted?: string | null;
          naver_pw_encrypted?: string | null;
          blog_id?: string;
          assigned_worker?: string;
          cookies?: Json;
          cookies_updated_at?: string | null;
        };
      };
      user_personas: {
        Row: {
          id: string;
          user_id: string;
          display_name: string;
          source_blog_url: string | null;
          crawl_status: "none" | "crawling" | "analyzing" | "done" | "error";
          crawl_post_count: number;
          crawl_error: string | null;
          crawled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          display_name?: string;
          source_blog_url?: string | null;
          crawl_status?: "none" | "crawling" | "analyzing" | "done" | "error";
          crawl_post_count?: number;
          crawl_error?: string | null;
          crawled_at?: string | null;
        };
        Update: {
          display_name?: string;
          source_blog_url?: string | null;
          crawl_status?: "none" | "crawling" | "analyzing" | "done" | "error";
          crawl_post_count?: number;
          crawl_error?: string | null;
          crawled_at?: string | null;
        };
      };
      persona_items: {
        Row: {
          id: string;
          persona_id: string;
          category:
            | "voice"
            | "emoji"
            | "structure"
            | "ending"
            | "forbidden"
            | "custom"
            | "formatting";
          key: string;
          value: string;
          priority: number;
          is_active: boolean;
          source: "ai" | "user" | "feedback";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          persona_id: string;
          category:
            | "voice"
            | "emoji"
            | "structure"
            | "ending"
            | "forbidden"
            | "custom"
            | "formatting";
          key: string;
          value: string;
          priority?: number;
          is_active?: boolean;
          source?: "ai" | "user" | "feedback";
        };
        Update: {
          category?:
            | "voice"
            | "emoji"
            | "structure"
            | "ending"
            | "forbidden"
            | "custom"
            | "formatting";
          key?: string;
          value?: string;
          priority?: number;
          is_active?: boolean;
          source?: "ai" | "user" | "feedback";
        };
      };
      persona_feedback: {
        Row: {
          id: string;
          persona_id: string;
          generation_id: string | null;
          feedback_text: string;
          derived_rule: string | null;
          rule_status: "pending" | "approved" | "rejected";
          created_at: string;
        };
        Insert: {
          id?: string;
          persona_id: string;
          generation_id?: string | null;
          feedback_text: string;
          derived_rule?: string | null;
          rule_status?: "pending" | "approved" | "rejected";
        };
        Update: {
          derived_rule?: string | null;
          rule_status?: "pending" | "approved" | "rejected";
        };
      };
      generation_queue: {
        Row: {
          id: string;
          user_id: string;
          input_photos: Json;
          input_memo: string | null;
          input_category:
            | "맛집"
            | "여행"
            | "일상"
            | "카페"
            | "기타"
            | null;
          status:
            | "pending"
            | "processing"
            | "completed"
            | "failed"
            | "cancelled";
          priority: number;
          worker_id: string | null;
          started_at: string | null;
          completed_at: string | null;
          generated_title: string | null;
          generated_body: string | null;
          generated_html: string | null;
          generated_hashtags: Json;
          user_feedback: string | null;
          final_html: string | null;
          error_message: string | null;
          retry_count: number;
          source: "web" | "telegram";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          input_photos?: Json;
          input_memo?: string | null;
          input_category?:
            | "맛집"
            | "여행"
            | "일상"
            | "카페"
            | "기타"
            | null;
          status?:
            | "pending"
            | "processing"
            | "completed"
            | "failed"
            | "cancelled";
          priority?: number;
          generated_title?: string | null;
          generated_body?: string | null;
          generated_html?: string | null;
          generated_hashtags?: Json;
          source?: "web" | "telegram";
        };
        Update: {
          status?:
            | "pending"
            | "processing"
            | "completed"
            | "failed"
            | "cancelled";
          worker_id?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          generated_title?: string | null;
          generated_body?: string | null;
          generated_html?: string | null;
          generated_hashtags?: Json;
          user_feedback?: string | null;
          final_html?: string | null;
          error_message?: string | null;
          retry_count?: number;
          source?: "web" | "telegram";
        };
      };
    };
    Views: {
      user_queue_stats: {
        Row: {
          user_id: string;
          pending_count: number;
          processing_count: number;
          completed_count: number;
          failed_count: number;
          total_count: number;
        };
      };
    };
  };
}
