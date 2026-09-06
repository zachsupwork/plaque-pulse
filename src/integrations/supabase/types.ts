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
      action_history: {
        Row: {
          action_type: string
          approved_by_user_id: string | null
          business_id: string
          created_at: string
          id: string
          initiated_by: Database["public"]["Enums"]["initiated_by"]
          new_value: Json | null
          plaque_id: string | null
          previous_value: Json | null
        }
        Insert: {
          action_type: string
          approved_by_user_id?: string | null
          business_id: string
          created_at?: string
          id?: string
          initiated_by?: Database["public"]["Enums"]["initiated_by"]
          new_value?: Json | null
          plaque_id?: string | null
          previous_value?: Json | null
        }
        Update: {
          action_type?: string
          approved_by_user_id?: string | null
          business_id?: string
          created_at?: string
          id?: string
          initiated_by?: Database["public"]["Enums"]["initiated_by"]
          new_value?: Json | null
          plaque_id?: string | null
          previous_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "action_history_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "action_history_plaque_id_fkey"
            columns: ["plaque_id"]
            isOneToOne: false
            referencedRelation: "plaques"
            referencedColumns: ["id"]
          },
        ]
      }
      activation_attempts: {
        Row: {
          attempt_key: string
          created_at: string
          id: string
          succeeded: boolean
        }
        Insert: {
          attempt_key: string
          created_at?: string
          id?: string
          succeeded?: boolean
        }
        Update: {
          attempt_key?: string
          created_at?: string
          id?: string
          succeeded?: boolean
        }
        Relationships: []
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string
          id: string
          industry: string
          is_demo: boolean
          name: string
          primary_goal: string | null
          status: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          industry?: string
          is_demo?: boolean
          name: string
          primary_goal?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          industry?: string
          is_demo?: boolean
          name?: string
          primary_goal?: string | null
          status?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      conversation_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          tool_calls: Json | null
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tool_calls?: Json | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tool_calls?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          business_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      destinations: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          destination_type: Database["public"]["Enums"]["destination_type"]
          effective_from: string
          effective_to: string | null
          id: string
          metadata: Json
          plaque_id: string | null
          url: string
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          destination_type: Database["public"]["Enums"]["destination_type"]
          effective_from?: string
          effective_to?: string | null
          id?: string
          metadata?: Json
          plaque_id?: string | null
          url: string
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          destination_type?: Database["public"]["Enums"]["destination_type"]
          effective_from?: string
          effective_to?: string | null
          id?: string
          metadata?: Json
          plaque_id?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "destinations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "destinations_plaque_id_fkey"
            columns: ["plaque_id"]
            isOneToOne: false
            referencedRelation: "plaques"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          anonymous_visitor_key: string | null
          browser_family: string | null
          business_id: string | null
          coarse_country: string | null
          coarse_region: string | null
          destination_id: string | null
          destination_type:
            | Database["public"]["Enums"]["destination_type"]
            | null
          device_family: string | null
          event_type: Database["public"]["Enums"]["event_type"]
          id: string
          intent_type: Database["public"]["Enums"]["intent_type"] | null
          location_id: string | null
          metadata: Json
          occurred_at: string
          plaque_id: string | null
          source_type: Database["public"]["Enums"]["source_type"] | null
        }
        Insert: {
          anonymous_visitor_key?: string | null
          browser_family?: string | null
          business_id?: string | null
          coarse_country?: string | null
          coarse_region?: string | null
          destination_id?: string | null
          destination_type?:
            | Database["public"]["Enums"]["destination_type"]
            | null
          device_family?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          intent_type?: Database["public"]["Enums"]["intent_type"] | null
          location_id?: string | null
          metadata?: Json
          occurred_at?: string
          plaque_id?: string | null
          source_type?: Database["public"]["Enums"]["source_type"] | null
        }
        Update: {
          anonymous_visitor_key?: string | null
          browser_family?: string | null
          business_id?: string | null
          coarse_country?: string | null
          coarse_region?: string | null
          destination_id?: string | null
          destination_type?:
            | Database["public"]["Enums"]["destination_type"]
            | null
          device_family?: string | null
          event_type?: Database["public"]["Enums"]["event_type"]
          id?: string
          intent_type?: Database["public"]["Enums"]["intent_type"] | null
          location_id?: string | null
          metadata?: Json
          occurred_at?: string
          plaque_id?: string | null
          source_type?: Database["public"]["Enums"]["source_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_plaque_id_fkey"
            columns: ["plaque_id"]
            isOneToOne: false
            referencedRelation: "plaques"
            referencedColumns: ["id"]
          },
        ]
      }
      experiment_variants: {
        Row: {
          configuration: Json
          experiment_id: string
          id: string
          label: string | null
          plaque_id: string | null
        }
        Insert: {
          configuration?: Json
          experiment_id: string
          id?: string
          label?: string | null
          plaque_id?: string | null
        }
        Update: {
          configuration?: Json
          experiment_id?: string
          id?: string
          label?: string | null
          plaque_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "experiment_variants_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "experiments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiment_variants_plaque_id_fkey"
            columns: ["plaque_id"]
            isOneToOne: false
            referencedRelation: "plaques"
            referencedColumns: ["id"]
          },
        ]
      }
      experiments: {
        Row: {
          business_id: string
          created_by_user_id: string | null
          ended_at: string | null
          experiment_type: string
          hypothesis: string | null
          id: string
          name: string
          primary_goal: string | null
          started_at: string
          status: string
        }
        Insert: {
          business_id: string
          created_by_user_id?: string | null
          ended_at?: string | null
          experiment_type?: string
          hypothesis?: string | null
          id?: string
          name: string
          primary_goal?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          business_id?: string
          created_by_user_id?: string | null
          ended_at?: string | null
          experiment_type?: string
          hypothesis?: string | null
          id?: string
          name?: string
          primary_goal?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          goal_type: string
          id: string
          priority: number
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          goal_type: string
          id?: string
          priority?: number
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          goal_type?: string
          id?: string
          priority?: number
        }
        Relationships: [
          {
            foreignKeyName: "goals_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          business_id: string
          connected_at: string | null
          credentials_reference: string | null
          external_account_id: string | null
          id: string
          integration_type: string
          last_sync_at: string | null
          scopes: string[] | null
          status: string
        }
        Insert: {
          business_id: string
          connected_at?: string | null
          credentials_reference?: string | null
          external_account_id?: string | null
          id?: string
          integration_type: string
          last_sync_at?: string | null
          scopes?: string[] | null
          status?: string
        }
        Update: {
          business_id?: string
          connected_at?: string | null
          credentials_reference?: string | null
          external_account_id?: string | null
          id?: string
          integration_type?: string
          last_sync_at?: string | null
          scopes?: string[] | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          address: string | null
          business_id: string
          city: string | null
          country: string | null
          created_at: string
          google_business_status: string | null
          google_maps_uri: string | null
          google_place_id: string | null
          google_primary_type: string | null
          google_rating: number | null
          google_review_count: number | null
          google_review_url: string | null
          google_review_url_checked_at: string | null
          google_review_url_source: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          phone: string | null
          province_state: string | null
          public_data_last_synced_at: string | null
          timezone: string | null
          website_url: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          business_id: string
          city?: string | null
          country?: string | null
          created_at?: string
          google_business_status?: string | null
          google_maps_uri?: string | null
          google_place_id?: string | null
          google_primary_type?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          google_review_url?: string | null
          google_review_url_checked_at?: string | null
          google_review_url_source?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          phone?: string | null
          province_state?: string | null
          public_data_last_synced_at?: string | null
          timezone?: string | null
          website_url?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          business_id?: string
          city?: string | null
          country?: string | null
          created_at?: string
          google_business_status?: string | null
          google_maps_uri?: string | null
          google_place_id?: string | null
          google_primary_type?: string | null
          google_rating?: number | null
          google_review_count?: number | null
          google_review_url?: string | null
          google_review_url_checked_at?: string | null
          google_review_url_source?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          phone?: string | null
          province_state?: string | null
          public_data_last_synced_at?: string | null
          timezone?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_snapshots: {
        Row: {
          business_id: string
          captured_at: string
          id: string
          integration_id: string | null
          location_id: string | null
          metadata: Json
          metric_type: string
          metric_value: number
        }
        Insert: {
          business_id: string
          captured_at?: string
          id?: string
          integration_id?: string | null
          location_id?: string | null
          metadata?: Json
          metric_type: string
          metric_value: number
        }
        Update: {
          business_id?: string
          captured_at?: string
          id?: string
          integration_id?: string | null
          location_id?: string | null
          metadata?: Json
          metric_type?: string
          metric_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "metric_snapshots_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_snapshots_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_snapshots_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      nfc_handoffs: {
        Row: {
          created_at: string
          created_by_user_id: string
          expected_url: string
          expires_at: string
          id: string
          plaque_id: string
          result: string | null
          token: string
          used_at: string | null
          used_by_user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          expected_url: string
          expires_at: string
          id?: string
          plaque_id: string
          result?: string | null
          token: string
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          expected_url?: string
          expires_at?: string
          id?: string
          plaque_id?: string
          result?: string | null
          token?: string
          used_at?: string | null
          used_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nfc_handoffs_plaque_id_fkey"
            columns: ["plaque_id"]
            isOneToOne: false
            referencedRelation: "plaques"
            referencedColumns: ["id"]
          },
        ]
      }
      offering_inquiries: {
        Row: {
          assigned_admin_user_id: string | null
          business_address: string | null
          business_id: string | null
          business_name: string | null
          closed_at: string | null
          contacted_at: string | null
          created_at: string
          email: string
          google_place_id: string | null
          id: string
          message: string | null
          name: string
          offering_id: string | null
          phone: string | null
          preferred_contact_method: string
          quantity_interest: string | null
          source: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_admin_user_id?: string | null
          business_address?: string | null
          business_id?: string | null
          business_name?: string | null
          closed_at?: string | null
          contacted_at?: string | null
          created_at?: string
          email: string
          google_place_id?: string | null
          id?: string
          message?: string | null
          name: string
          offering_id?: string | null
          phone?: string | null
          preferred_contact_method?: string
          quantity_interest?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_admin_user_id?: string | null
          business_address?: string | null
          business_id?: string | null
          business_name?: string | null
          closed_at?: string | null
          contacted_at?: string | null
          created_at?: string
          email?: string
          google_place_id?: string | null
          id?: string
          message?: string | null
          name?: string
          offering_id?: string | null
          phone?: string | null
          preferred_contact_method?: string
          quantity_interest?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offering_inquiries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offering_inquiries_offering_id_fkey"
            columns: ["offering_id"]
            isOneToOne: false
            referencedRelation: "offerings"
            referencedColumns: ["id"]
          },
        ]
      }
      offerings: {
        Row: {
          active: boolean
          category: string
          created_at: string
          cta_label: string
          featured: boolean
          full_description: string | null
          icon: string | null
          id: string
          image_url: string | null
          metadata: Json
          name: string
          short_description: string
          slug: string
          sort_order: number
          starting_price_text: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          cta_label?: string
          featured?: boolean
          full_description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          metadata?: Json
          name: string
          short_description?: string
          slug: string
          sort_order?: number
          starting_price_text?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          cta_label?: string
          featured?: boolean
          full_description?: string | null
          icon?: string | null
          id?: string
          image_url?: string | null
          metadata?: Json
          name?: string
          short_description?: string
          slug?: string
          sort_order?: number
          starting_price_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      outcomes: {
        Row: {
          attribution_type: Database["public"]["Enums"]["attribution_type"]
          business_id: string
          destination_id: string | null
          external_id: string | null
          id: string
          metadata: Json
          occurred_at: string
          outcome_type: string
          plaque_id: string | null
          value: number | null
        }
        Insert: {
          attribution_type?: Database["public"]["Enums"]["attribution_type"]
          business_id: string
          destination_id?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          outcome_type: string
          plaque_id?: string | null
          value?: number | null
        }
        Update: {
          attribution_type?: Database["public"]["Enums"]["attribution_type"]
          business_id?: string
          destination_id?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json
          occurred_at?: string
          outcome_type?: string
          plaque_id?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "outcomes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outcomes_destination_id_fkey"
            columns: ["destination_id"]
            isOneToOne: false
            referencedRelation: "destinations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outcomes_plaque_id_fkey"
            columns: ["plaque_id"]
            isOneToOne: false
            referencedRelation: "plaques"
            referencedColumns: ["id"]
          },
        ]
      }
      pack_plaques: {
        Row: {
          created_at: string
          id: string
          pack_id: string
          plaque_id: string
          position: number
        }
        Insert: {
          created_at?: string
          id?: string
          pack_id: string
          plaque_id: string
          position?: number
        }
        Update: {
          created_at?: string
          id?: string
          pack_id?: string
          plaque_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "pack_plaques_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "plaque_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pack_plaques_plaque_id_fkey"
            columns: ["plaque_id"]
            isOneToOne: false
            referencedRelation: "plaques"
            referencedColumns: ["id"]
          },
        ]
      }
      plaque_packs: {
        Row: {
          activation_token_hash: string | null
          business_id: string | null
          claimed_at: string | null
          created_at: string
          id: string
          pack_code: string
          status: string
        }
        Insert: {
          activation_token_hash?: string | null
          business_id?: string | null
          claimed_at?: string | null
          created_at?: string
          id?: string
          pack_code: string
          status?: string
        }
        Update: {
          activation_token_hash?: string | null
          business_id?: string | null
          claimed_at?: string | null
          created_at?: string
          id?: string
          pack_code?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "plaque_packs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      plaque_placement_history: {
        Row: {
          changed_by_user_id: string | null
          effective_from: string
          effective_to: string | null
          id: string
          location_id: string | null
          placement_name: string | null
          placement_type: string | null
          plaque_id: string
          reason: string | null
        }
        Insert: {
          changed_by_user_id?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          location_id?: string | null
          placement_name?: string | null
          placement_type?: string | null
          plaque_id: string
          reason?: string | null
        }
        Update: {
          changed_by_user_id?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          location_id?: string | null
          placement_name?: string | null
          placement_type?: string | null
          plaque_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plaque_placement_history_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaque_placement_history_plaque_id_fkey"
            columns: ["plaque_id"]
            isOneToOne: false
            referencedRelation: "plaques"
            referencedColumns: ["id"]
          },
        ]
      }
      plaque_programming: {
        Row: {
          batch_id: string | null
          created_at: string
          device_info: Json
          expected_nfc_url: string
          id: string
          notes: string | null
          plaque_id: string
          programmed_at: string | null
          programmed_by_user_id: string | null
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by_user_id: string | null
          write_status: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          device_info?: Json
          expected_nfc_url: string
          id?: string
          notes?: string | null
          plaque_id: string
          programmed_at?: string | null
          programmed_by_user_id?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by_user_id?: string | null
          write_status?: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          device_info?: Json
          expected_nfc_url?: string
          id?: string
          notes?: string | null
          plaque_id?: string
          programmed_at?: string | null
          programmed_by_user_id?: string | null
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by_user_id?: string | null
          write_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "plaque_programming_plaque_id_fkey"
            columns: ["plaque_id"]
            isOneToOne: true
            referencedRelation: "plaques"
            referencedColumns: ["id"]
          },
        ]
      }
      plaques: {
        Row: {
          activated_at: string | null
          activation_token_hash: string | null
          base_type: string | null
          batch_id: string | null
          business_id: string | null
          claimed_at: string | null
          claimed_by_user_id: string | null
          configured_at: string | null
          created_at: string
          id: string
          location_id: string | null
          placement_type: string | null
          plaque_code: string
          plaque_name: string | null
          product_type: string
          public_slug: string
          sku: string | null
          status: Database["public"]["Enums"]["plaque_status"]
          style: string | null
        }
        Insert: {
          activated_at?: string | null
          activation_token_hash?: string | null
          base_type?: string | null
          batch_id?: string | null
          business_id?: string | null
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          configured_at?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          placement_type?: string | null
          plaque_code: string
          plaque_name?: string | null
          product_type?: string
          public_slug: string
          sku?: string | null
          status?: Database["public"]["Enums"]["plaque_status"]
          style?: string | null
        }
        Update: {
          activated_at?: string | null
          activation_token_hash?: string | null
          base_type?: string | null
          batch_id?: string | null
          business_id?: string | null
          claimed_at?: string | null
          claimed_by_user_id?: string | null
          configured_at?: string | null
          created_at?: string
          id?: string
          location_id?: string | null
          placement_type?: string | null
          plaque_code?: string
          plaque_name?: string | null
          product_type?: string
          public_slug?: string
          sku?: string | null
          status?: Database["public"]["Enums"]["plaque_status"]
          style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plaques_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plaques_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      programming_events: {
        Row: {
          actual_value: string | null
          created_at: string
          device_info: Json
          event_type: string
          expected_value: string | null
          id: string
          plaque_id: string | null
          result: string | null
          user_id: string | null
        }
        Insert: {
          actual_value?: string | null
          created_at?: string
          device_info?: Json
          event_type: string
          expected_value?: string | null
          id?: string
          plaque_id?: string | null
          result?: string | null
          user_id?: string | null
        }
        Update: {
          actual_value?: string | null
          created_at?: string
          device_info?: Json
          event_type?: string
          expected_value?: string | null
          id?: string
          plaque_id?: string | null
          result?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programming_events_plaque_id_fkey"
            columns: ["plaque_id"]
            isOneToOne: false
            referencedRelation: "plaques"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          business_id: string
          confidence: number | null
          created_at: string
          evidence: Json
          explanation: string
          id: string
          proposed_action: Json
          recommendation_type: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["recommendation_status"]
          title: string
        }
        Insert: {
          business_id: string
          confidence?: number | null
          created_at?: string
          evidence?: Json
          explanation: string
          id?: string
          proposed_action?: Json
          recommendation_type: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["recommendation_status"]
          title: string
        }
        Update: {
          business_id?: string
          confidence?: number | null
          created_at?: string
          evidence?: Json
          explanation?: string
          id?: string
          proposed_action?: Json
          recommendation_type?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["recommendation_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      setup_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          business_address: string | null
          business_id: string | null
          business_name: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          destination_type: string | null
          destination_url: string | null
          details: Json
          goal: string | null
          google_place_id: string | null
          id: string
          notes: string | null
          placement_type: string | null
          plaque_id: string | null
          plaque_slug: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          business_address?: string | null
          business_id?: string | null
          business_name: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          destination_type?: string | null
          destination_url?: string | null
          details?: Json
          goal?: string | null
          google_place_id?: string | null
          id?: string
          notes?: string | null
          placement_type?: string | null
          plaque_id?: string | null
          plaque_slug?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          business_address?: string | null
          business_id?: string | null
          business_name?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          destination_type?: string | null
          destination_url?: string | null
          details?: Json
          goal?: string | null
          google_place_id?: string | null
          id?: string
          notes?: string | null
          placement_type?: string | null
          plaque_id?: string | null
          plaque_slug?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "setup_requests_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setup_requests_plaque_id_fkey"
            columns: ["plaque_id"]
            isOneToOne: false
            referencedRelation: "plaques"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          business_id: string
          id: string
          plan: string
          renews_at: string | null
          started_at: string
          status: string
        }
        Insert: {
          business_id: string
          id?: string
          plan?: string
          renews_at?: string | null
          started_at?: string
          status?: string
        }
        Update: {
          business_id?: string
          id?: string
          plan?: string
          renews_at?: string | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
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
      app_role: "admin" | "moderator" | "user"
      attribution_type: "direct" | "correlated" | "unknown"
      destination_type:
        | "google_review"
        | "instagram"
        | "facebook"
        | "website"
        | "menu"
        | "booking"
        | "directions"
        | "call"
        | "quote"
        | "coupon"
        | "loyalty"
        | "custom"
      event_type:
        | "interaction"
        | "redirect_success"
        | "redirect_failure"
        | "lead_started"
        | "lead_submitted"
        | "coupon_claimed"
        | "coupon_redeemed"
        | "booking_started"
        | "booking_completed"
        | "custom_conversion"
        | "manufacturing_test"
      initiated_by: "owner" | "copilot" | "admin" | "automation"
      intent_type:
        | "review"
        | "social"
        | "menu"
        | "booking"
        | "lead"
        | "directions"
        | "website"
        | "promotion"
        | "loyalty"
        | "custom"
      member_role: "owner" | "admin" | "manager" | "viewer"
      plaque_status:
        | "inventory"
        | "packed"
        | "sold"
        | "claimed"
        | "active"
        | "paused"
        | "faulty"
        | "replaced"
        | "retired"
        | "configured_unclaimed"
      recommendation_status:
        | "new"
        | "viewed"
        | "accepted"
        | "rejected"
        | "expired"
      source_type: "nfc" | "qr"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "moderator", "user"],
      attribution_type: ["direct", "correlated", "unknown"],
      destination_type: [
        "google_review",
        "instagram",
        "facebook",
        "website",
        "menu",
        "booking",
        "directions",
        "call",
        "quote",
        "coupon",
        "loyalty",
        "custom",
      ],
      event_type: [
        "interaction",
        "redirect_success",
        "redirect_failure",
        "lead_started",
        "lead_submitted",
        "coupon_claimed",
        "coupon_redeemed",
        "booking_started",
        "booking_completed",
        "custom_conversion",
        "manufacturing_test",
      ],
      initiated_by: ["owner", "copilot", "admin", "automation"],
      intent_type: [
        "review",
        "social",
        "menu",
        "booking",
        "lead",
        "directions",
        "website",
        "promotion",
        "loyalty",
        "custom",
      ],
      member_role: ["owner", "admin", "manager", "viewer"],
      plaque_status: [
        "inventory",
        "packed",
        "sold",
        "claimed",
        "active",
        "paused",
        "faulty",
        "replaced",
        "retired",
        "configured_unclaimed",
      ],
      recommendation_status: [
        "new",
        "viewed",
        "accepted",
        "rejected",
        "expired",
      ],
      source_type: ["nfc", "qr"],
    },
  },
} as const
