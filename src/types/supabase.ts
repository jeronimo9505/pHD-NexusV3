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
      activity_log: {
        Row: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          group_id: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id: string
          entity_type: string
          group_id: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          group_id?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_comments: {
        Row: {
          announcement_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_comments_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          author_id: string
          content: string
          created_at: string
          group_id: string
          id: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          group_id: string
          id?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          group_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          all_day: boolean
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_at: string
          gcal_event_id: string | null
          group_id: string
          id: string
          location: string | null
          start_at: string
          title: string
          updated_at: string | null
          url: string | null
        }
        Insert: {
          all_day?: boolean
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_at: string
          gcal_event_id?: string | null
          group_id: string
          id?: string
          location?: string | null
          start_at: string
          title: string
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          all_day?: boolean
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_at?: string
          gcal_event_id?: string | null
          group_id?: string
          id?: string
          location?: string | null
          start_at?: string
          title?: string
          updated_at?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_report_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          report_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          report_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          report_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drive_report_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drive_report_comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "drive_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_report_task_links: {
        Row: {
          created_at: string
          drive_report_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          drive_report_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          drive_report_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drive_report_task_links_drive_report_id_fkey"
            columns: ["drive_report_id"]
            isOneToOne: false
            referencedRelation: "drive_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drive_report_task_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_report_views: {
        Row: {
          drive_report_id: string | null
          id: string
          user_id: string | null
          viewed_at: string | null
        }
        Insert: {
          drive_report_id?: string | null
          id?: string
          user_id?: string | null
          viewed_at?: string | null
        }
        Update: {
          drive_report_id?: string | null
          id?: string
          user_id?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drive_report_views_drive_report_id_fkey"
            columns: ["drive_report_id"]
            isOneToOne: false
            referencedRelation: "drive_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drive_report_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drive_reports: {
        Row: {
          author_id: string
          author_name: string | null
          created_at: string
          drive_file_id: string | null
          end_date: string | null
          group_id: string
          icon_link: string | null
          id: string
          is_important: boolean | null
          mime_type: string | null
          name: string
          sections: Json | null
          seen_by: Json | null
          start_date: string | null
          status: string | null
          submitted_at: string | null
          title: string | null
          type: string | null
          updated_at: string
          web_view_link: string | null
        }
        Insert: {
          author_id: string
          author_name?: string | null
          created_at?: string
          drive_file_id?: string | null
          end_date?: string | null
          group_id: string
          icon_link?: string | null
          id?: string
          is_important?: boolean | null
          mime_type?: string | null
          name: string
          sections?: Json | null
          seen_by?: Json | null
          start_date?: string | null
          status?: string | null
          submitted_at?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string
          web_view_link?: string | null
        }
        Update: {
          author_id?: string
          author_name?: string | null
          created_at?: string
          drive_file_id?: string | null
          end_date?: string | null
          group_id?: string
          icon_link?: string | null
          id?: string
          is_important?: boolean | null
          mime_type?: string | null
          name?: string
          sections?: Json | null
          seen_by?: Json | null
          start_date?: string | null
          status?: string | null
          submitted_at?: string | null
          title?: string | null
          type?: string | null
          updated_at?: string
          web_view_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drive_reports_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drive_reports_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          role: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_notes: {
        Row: {
          content: string
          created_at: string | null
          created_by: string
          group_id: string
          id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          created_by: string
          group_id: string
          id?: string
        }
        Update: {
          content?: string
          created_at?: string | null
          created_by?: string
          group_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_notes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          drive_settings: Json | null
          id: string
          kanban_columns: Json | null
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          drive_settings?: Json | null
          id?: string
          kanban_columns?: Json | null
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          drive_settings?: Json | null
          id?: string
          kanban_columns?: Json | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_comments: {
        Row: {
          author_id: string
          created_at: string
          id: string
          item_id: string
          text: string
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          item_id: string
          text: string
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          item_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_comments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "knowledge_items"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_items: {
        Row: {
          category: string | null
          content: string | null
          created_at: string
          created_by: string
          drive_file_id: string | null
          folder_id: string | null
          group_id: string
          id: string
          is_pinned: boolean | null
          is_starred: boolean | null
          resource_type: string | null
          tags: string[] | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string
          created_by: string
          drive_file_id?: string | null
          folder_id?: string | null
          group_id: string
          id?: string
          is_pinned?: boolean | null
          is_starred?: boolean | null
          resource_type?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string
          created_by?: string
          drive_file_id?: string | null
          folder_id?: string | null
          group_id?: string
          id?: string
          is_pinned?: boolean | null
          is_starred?: boolean | null
          resource_type?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_items_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      logbooks: {
        Row: {
          created_at: string | null
          description: string | null
          group_id: string
          id: string
          name: string
          prefix: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          group_id: string
          id?: string
          name: string
          prefix: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          group_id?: string
          id?: string
          name?: string
          prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "logbooks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_group_id: string | null
          email: string
          full_name: string | null
          id: string
          status: string
          system_role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_group_id?: string | null
          email: string
          full_name?: string | null
          id?: string
          status?: string
          system_role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_group_id?: string | null
          email?: string
          full_name?: string | null
          id?: string
          status?: string
          system_role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_group_id_fkey"
            columns: ["default_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      report_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          parent_id: string | null
          quote: string | null
          range_end: number | null
          range_start: number | null
          report_id: string
          resolved: boolean
          section_key: string | null
          thread_id: string | null
          type: string | null
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          parent_id?: string | null
          quote?: string | null
          range_end?: number | null
          range_start?: number | null
          report_id: string
          resolved?: boolean
          section_key?: string | null
          thread_id?: string | null
          type?: string | null
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          quote?: string | null
          range_end?: number | null
          range_start?: number | null
          report_id?: string
          resolved?: boolean
          section_key?: string | null
          thread_id?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "report_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comments_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_comments_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "report_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      report_knowledge_links: {
        Row: {
          created_at: string
          item_id: string
          report_id: string
        }
        Insert: {
          created_at?: string
          item_id: string
          report_id: string
        }
        Update: {
          created_at?: string
          item_id?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_knowledge_links_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "knowledge_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_knowledge_links_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_sections: {
        Row: {
          content: string
          key: string
          report_id: string
        }
        Insert: {
          content?: string
          key: string
          report_id: string
        }
        Update: {
          content?: string
          key?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_sections_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      report_task_links: {
        Row: {
          created_at: string
          report_id: string
          task_id: string
        }
        Insert: {
          created_at?: string
          report_id: string
          task_id: string
        }
        Update: {
          created_at?: string
          report_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_task_links_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_task_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      report_views: {
        Row: {
          id: string
          report_id: string
          seen_at: string | null
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          report_id: string
          seen_at?: string | null
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          report_id?: string
          seen_at?: string | null
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_views_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          author_id: string
          created_at: string
          group_id: string
          id: string
          is_important: boolean
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          supervisor_feedback: string | null
          week_end: string
          week_start: string
        }
        Insert: {
          author_id: string
          created_at?: string
          group_id: string
          id?: string
          is_important?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          supervisor_feedback?: string | null
          week_end: string
          week_start: string
        }
        Update: {
          author_id?: string
          created_at?: string
          group_id?: string
          id?: string
          is_important?: boolean
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          supervisor_feedback?: string | null
          week_end?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_fkey"
            columns: ["role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["name"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      sample_audit_log: {
        Row: {
          action: string
          changes: Json | null
          created_at: string
          id: string
          sample_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          changes?: Json | null
          created_at?: string
          id?: string
          sample_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          changes?: Json | null
          created_at?: string
          id?: string
          sample_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sample_audit_log_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_characterizations: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          images: string[] | null
          performed_at: string | null
          sample_id: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          images?: string[] | null
          performed_at?: string | null
          sample_id: string
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          images?: string[] | null
          performed_at?: string | null
          sample_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sample_characterizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_characterizations_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          sample_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          sample_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          sample_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sample_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_comments_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_fields_config: {
        Row: {
          group_id: string
          id: string
          label: string
          logbook_id: string | null
          name: string
          options: Json | null
          order: number
          required: boolean
          type: string
        }
        Insert: {
          group_id: string
          id?: string
          label: string
          logbook_id?: string | null
          name: string
          options?: Json | null
          order?: number
          required?: boolean
          type: string
        }
        Update: {
          group_id?: string
          id?: string
          label?: string
          logbook_id?: string | null
          name?: string
          options?: Json | null
          order?: number
          required?: boolean
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sample_fields_config_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_fields_config_logbook_id_fkey"
            columns: ["logbook_id"]
            isOneToOne: false
            referencedRelation: "logbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      sample_nomenclatures: {
        Row: {
          category: string
          code: string
          group_id: string
          id: string
          logbook_id: string | null
          name: string
        }
        Insert: {
          category: string
          code: string
          group_id: string
          id?: string
          logbook_id?: string | null
          name: string
        }
        Update: {
          category?: string
          code?: string
          group_id?: string
          id?: string
          logbook_id?: string | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "sample_nomenclatures_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sample_nomenclatures_logbook_id_fkey"
            columns: ["logbook_id"]
            isOneToOne: false
            referencedRelation: "logbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      samples: {
        Row: {
          attributes: Json
          composition: Json
          created_at: string
          created_by: string | null
          description: string | null
          display_id: string
          group_id: string
          id: string
          level: number | null
          logbook_id: string | null
          name: string
          parent_id: string | null
          sample_code: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          attributes?: Json
          composition?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_id: string
          group_id: string
          id?: string
          level?: number | null
          logbook_id?: string | null
          name?: string
          parent_id?: string | null
          sample_code?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          attributes?: Json
          composition?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_id?: string
          group_id?: string
          id?: string
          level?: number | null
          logbook_id?: string | null
          name?: string
          parent_id?: string | null
          sample_code?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "samples_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_logbook_id_fkey"
            columns: ["logbook_id"]
            isOneToOne: false
            referencedRelation: "logbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "samples_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "samples"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignees: {
        Row: {
          assigned_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          task_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          group_id: string
          id: string
          previous_status: string | null
          priority: string
          status: string
          subtasks: Json | null
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          group_id: string
          id?: string
          previous_status?: string | null
          priority?: string
          status?: string
          subtasks?: Json | null
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          group_id?: string
          id?: string
          previous_status?: string | null
          priority?: string
          status?: string
          subtasks?: Json | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
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
