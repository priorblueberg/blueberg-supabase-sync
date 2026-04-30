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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      fp_categorias: {
        Row: {
          created_at: string
          id: string
          is_padrao: boolean
          nome: string
          tipo: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_padrao?: boolean
          nome: string
          tipo: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_padrao?: boolean
          nome?: string
          tipo?: string
          user_id?: string | null
        }
        Relationships: []
      }
      fp_contas: {
        Row: {
          ativa: boolean
          banco: string | null
          created_at: string
          data_inicio: string
          id: string
          nome: string
          saldo_inicial: number
          user_id: string
        }
        Insert: {
          ativa?: boolean
          banco?: string | null
          created_at?: string
          data_inicio: string
          id?: string
          nome: string
          saldo_inicial?: number
          user_id: string
        }
        Update: {
          ativa?: boolean
          banco?: string | null
          created_at?: string
          data_inicio?: string
          id?: string
          nome?: string
          saldo_inicial?: number
          user_id?: string
        }
        Relationships: []
      }
      fp_formas_pagamento: {
        Row: {
          created_at: string
          id: string
          is_padrao: boolean
          nome: string
          tipo: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_padrao?: boolean
          nome: string
          tipo: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_padrao?: boolean
          nome?: string
          tipo?: string
          user_id?: string | null
        }
        Relationships: []
      }
      fp_lancamentos: {
        Row: {
          categoria_id: string | null
          conta_id: string
          created_at: string
          data: string
          descricao: string | null
          forma_pagamento_id: string | null
          id: string
          subcategoria_id: string | null
          tipo: string
          user_id: string
          valor: number
        }
        Insert: {
          categoria_id?: string | null
          conta_id: string
          created_at?: string
          data: string
          descricao?: string | null
          forma_pagamento_id?: string | null
          id?: string
          subcategoria_id?: string | null
          tipo: string
          user_id: string
          valor: number
        }
        Update: {
          categoria_id?: string | null
          conta_id?: string
          created_at?: string
          data?: string
          descricao?: string | null
          forma_pagamento_id?: string | null
          id?: string
          subcategoria_id?: string | null
          tipo?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "fp_lancamentos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fp_categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_lancamentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "fp_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_lancamentos_forma_pagamento_id_fkey"
            columns: ["forma_pagamento_id"]
            isOneToOne: false
            referencedRelation: "fp_formas_pagamento"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fp_lancamentos_subcategoria_id_fkey"
            columns: ["subcategoria_id"]
            isOneToOne: false
            referencedRelation: "fp_subcategorias"
            referencedColumns: ["id"]
          },
        ]
      }
      fp_subcategorias: {
        Row: {
          categoria_id: string
          created_at: string
          id: string
          is_padrao: boolean
          nome: string
          user_id: string | null
        }
        Insert: {
          categoria_id: string
          created_at?: string
          id?: string
          is_padrao?: boolean
          nome: string
          user_id?: string | null
        }
        Update: {
          categoria_id?: string
          created_at?: string
          id?: string
          is_padrao?: boolean
          nome?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fp_subcategorias_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "fp_categorias"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          data_nascimento: string | null
          email: string | null
          id: string
          nome_completo: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          nome_completo?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          id?: string
          nome_completo?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
