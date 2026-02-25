export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      client: {
        Row: {
          brand_color_hex: string | null
          client_id: number
          company_name: string
          contact_email: string
          created_at: string
          github_org_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand_color_hex?: string | null
          client_id?: never
          company_name: string
          contact_email: string
          created_at?: string
          github_org_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brand_color_hex?: string | null
          client_id?: never
          company_name?: string
          contact_email?: string
          created_at?: string
          github_org_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deliverable: {
        Row: {
          deliverable_id: number
          project_id: number | null
          assigned_to: number | null
          title: string
          description: string | null
          status: Database["public"]["Enums"]["deliverable_status"]
          priority: number
          due_date: string | null
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          deliverable_id?: never
          project_id?: number | null
          assigned_to?: number | null
          title: string
          description?: string | null
          status?: Database["public"]["Enums"]["deliverable_status"]
          priority?: number
          due_date?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          deliverable_id?: never
          project_id?: number | null
          assigned_to?: number | null
          title?: string
          description?: string | null
          status?: Database["public"]["Enums"]["deliverable_status"]
          priority?: number
          due_date?: string | null
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverable_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["project_id"]
          },
          {
            foreignKeyName: "deliverable_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_member"
            referencedColumns: ["team_member_id"]
          },
        ]
      }
      lead: {
        Row: {
          lead_id: number
          name: string
          email: string
          company: string | null
          project_type: string | null
          budget: string | null
          description: string | null
          submitted_at: string
        }
        Insert: {
          lead_id?: never
          name: string
          email: string
          company?: string | null
          project_type?: string | null
          budget?: string | null
          description?: string | null
          submitted_at?: string
        }
        Update: {
          lead_id?: never
          name?: string
          email?: string
          company?: string | null
          project_type?: string | null
          budget?: string | null
          description?: string | null
          submitted_at?: string
        }
        Relationships: []
      }
      portfolio_project: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          image_url: string | null
          is_featured: boolean
          portfolio_project_id: number
          preview_url: string | null
          tech_stack: string[] | null
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          image_url?: string | null
          is_featured?: boolean
          portfolio_project_id?: never
          preview_url?: string | null
          tech_stack?: string[] | null
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          image_url?: string | null
          is_featured?: boolean
          portfolio_project_id?: never
          preview_url?: string | null
          tech_stack?: string[] | null
          title?: string
        }
        Relationships: []
      }
      progress_update: {
        Row: {
          commit_sha_reference: string | null
          created_at: string
          progress_update_id: number
          project_id: number
          update_body: string | null
          update_title: string
        }
        Insert: {
          commit_sha_reference?: string | null
          created_at?: string
          progress_update_id?: never
          project_id: number
          update_body?: string | null
          update_title: string
        }
        Update: {
          commit_sha_reference?: string | null
          created_at?: string
          progress_update_id?: never
          project_id?: number
          update_body?: string | null
          update_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "progress_update_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "project"
            referencedColumns: ["project_id"]
          },
        ]
      }
      social_post: {
        Row: {
          social_post_id: number
          platform: string
          content: string
          image_url: string | null
          scheduled_for: string | null
          is_published: boolean
          published_at: string | null
          created_at: string
        }
        Insert: {
          social_post_id?: never
          platform: string
          content: string
          image_url?: string | null
          scheduled_for?: string | null
          is_published?: boolean
          published_at?: string | null
          created_at?: string
        }
        Update: {
          social_post_id?: never
          platform?: string
          content?: string
          image_url?: string | null
          scheduled_for?: string | null
          is_published?: boolean
          published_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      team_member: {
        Row: {
          team_member_id: number
          name: string
          role: string
          email: string | null
          avatar_url: string | null
          is_active: boolean
          created_at: string
        }
        Insert: {
          team_member_id?: never
          name: string
          role: string
          email?: string | null
          avatar_url?: string | null
          is_active?: boolean
          created_at?: string
        }
        Update: {
          team_member_id?: never
          name?: string
          role?: string
          email?: string | null
          avatar_url?: string | null
          is_active?: boolean
          created_at?: string
        }
        Relationships: []
      }
      project: {
        Row: {
          amount_paid_cents: number
          client_id: number
          created_at: string
          description: string | null
          is_active: boolean
          preview_url: string | null
          project_id: number
          project_status: Database["public"]["Enums"]["project_status"]
          repository_name: string | null
          tech_stack: string[] | null
          title: string
          total_value_cents: number
          updated_at: string
        }
        Insert: {
          amount_paid_cents?: number
          client_id: number
          created_at?: string
          description?: string | null
          is_active?: boolean
          preview_url?: string | null
          project_id?: never
          project_status?: Database["public"]["Enums"]["project_status"]
          repository_name?: string | null
          tech_stack?: string[] | null
          title: string
          total_value_cents?: number
          updated_at?: string
        }
        Update: {
          amount_paid_cents?: number
          client_id?: number
          created_at?: string
          description?: string | null
          is_active?: boolean
          preview_url?: string | null
          project_id?: never
          project_status?: Database["public"]["Enums"]["project_status"]
          repository_name?: string | null
          tech_stack?: string[] | null
          title?: string
          total_value_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client"
            referencedColumns: ["client_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      deliverable_status:
        | "not_started"
        | "in_progress"
        | "review"
        | "completed"
        | "blocked"
      project_status:
        | "discovery"
        | "architecture"
        | "development"
        | "testing"
        | "shipped"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      deliverable_status: [
        "not_started",
        "in_progress",
        "review",
        "completed",
        "blocked",
      ],
      project_status: [
        "discovery",
        "architecture",
        "development",
        "testing",
        "shipped",
      ],
    },
  },
} as const
