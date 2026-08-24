/**
 * AUTO-GENERATED from the live Supabase database schema (project
 * umuctbiofbyjwnqavxus) via the Supabase MCP generate_typescript_types tool.
 *
 * This is the source of truth for what tables/columns actually exist —
 * unlike the repo's .sql migration files, several of which describe a
 * schema that was never applied (see AUDIT.md). Regenerate whenever the
 * live schema changes; do not hand-edit.
 */
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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      attendance: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attendance_date: string
          check_in: string | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_selfie_url: string | null
          check_out: string | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_selfie_url: string | null
          created_at: string
          employee_id: string
          field_visit_location: string | null
          half_day: boolean
          id: string
          late_minutes: number
          leave_type: string | null
          meeting_location: string | null
          remarks: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attendance_date: string
          check_in?: string | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_selfie_url?: string | null
          check_out?: string | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_selfie_url?: string | null
          created_at?: string
          employee_id: string
          field_visit_location?: string | null
          half_day?: boolean
          id?: string
          late_minutes?: number
          leave_type?: string | null
          meeting_location?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attendance_date?: string
          check_in?: string | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_selfie_url?: string | null
          check_out?: string | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_selfie_url?: string | null
          created_at?: string
          employee_id?: string
          field_visit_location?: string | null
          half_day?: boolean
          id?: string
          late_minutes?: number
          leave_type?: string | null
          meeting_location?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          new_data: Json | null
          old_data: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          new_data?: Json | null
          old_data?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_documents: {
        Row: {
          booking_id: string
          created_at: string
          document_name: string
          document_type: string
          id: string
          remarks: string | null
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          booking_id: string
          created_at?: string
          document_name: string
          document_type: string
          id?: string
          remarks?: string | null
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          booking_id?: string
          created_at?: string
          document_name?: string
          document_type?: string
          id?: string
          remarks?: string | null
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_documents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          agreement_status: string
          booking_amount: number
          booking_date: string
          booking_number: string
          cancellation_reason: string | null
          cancelled_at: string | null
          channel_partner_id: string | null
          closing_manager: string | null
          consideration_amount: number
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_mobile: string | null
          customer_name: string
          development_charges: number
          gst_amount: number
          id: string
          inventory_id: string
          lead_id: string
          maintenance_charges: number
          notes: string | null
          other_charges: number
          parking_charges: number
          payment_plan: string | null
          project_id: string
          refund_amount: number
          registration_charges: number
          sales_owner: string | null
          stamp_duty: number
          status: Database["public"]["Enums"]["booking_status"]
          token_amount: number
          total_additional_charges: number
          total_agreement_value: number
          total_payable_amount: number
          tower_id: string | null
          updated_at: string
        }
        Insert: {
          agreement_status?: string
          booking_amount?: number
          booking_date?: string
          booking_number: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          channel_partner_id?: string | null
          closing_manager?: string | null
          consideration_amount?: number
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_mobile?: string | null
          customer_name: string
          development_charges?: number
          gst_amount?: number
          id?: string
          inventory_id: string
          lead_id: string
          maintenance_charges?: number
          notes?: string | null
          other_charges?: number
          parking_charges?: number
          payment_plan?: string | null
          project_id: string
          refund_amount?: number
          registration_charges?: number
          sales_owner?: string | null
          stamp_duty?: number
          status?: Database["public"]["Enums"]["booking_status"]
          token_amount?: number
          total_additional_charges?: number
          total_agreement_value?: number
          total_payable_amount?: number
          tower_id?: string | null
          updated_at?: string
        }
        Update: {
          agreement_status?: string
          booking_amount?: number
          booking_date?: string
          booking_number?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          channel_partner_id?: string | null
          closing_manager?: string | null
          consideration_amount?: number
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_mobile?: string | null
          customer_name?: string
          development_charges?: number
          gst_amount?: number
          id?: string
          inventory_id?: string
          lead_id?: string
          maintenance_charges?: number
          notes?: string | null
          other_charges?: number
          parking_charges?: number
          payment_plan?: string | null
          project_id?: string
          refund_amount?: number
          registration_charges?: number
          sales_owner?: string | null
          stamp_duty?: number
          status?: Database["public"]["Enums"]["booking_status"]
          token_amount?: number
          total_additional_charges?: number
          total_agreement_value?: number
          total_payable_amount?: number
          tower_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_channel_partner_id_fkey"
            columns: ["channel_partner_id"]
            isOneToOne: false
            referencedRelation: "channel_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_closing_manager_fkey"
            columns: ["closing_manager"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "project_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_sales_owner_fkey"
            columns: ["sales_owner"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          called_at: string
          channel_partner_id: string | null
          created_at: string
          direction: string
          duration_seconds: number | null
          employee_id: string | null
          id: string
          lead_id: string | null
          notes: string | null
          outcome: string | null
        }
        Insert: {
          called_at?: string
          channel_partner_id?: string | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          employee_id?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          outcome?: string | null
        }
        Update: {
          called_at?: string
          channel_partner_id?: string | null
          created_at?: string
          direction?: string
          duration_seconds?: number | null
          employee_id?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          outcome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_logs_channel_partner_id_fkey"
            columns: ["channel_partner_id"]
            isOneToOne: false
            referencedRelation: "channel_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          bookings: number
          budget: number
          campaign_code: string | null
          campaign_name: string
          campaign_type: string | null
          clicks: number
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          impressions: number
          leads: number
          objective: string | null
          platform: string | null
          project_id: string
          qualified_leads: number
          revenue: number
          site_visits: number
          spend: number
          start_date: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          updated_at: string
        }
        Insert: {
          bookings?: number
          budget?: number
          campaign_code?: string | null
          campaign_name: string
          campaign_type?: string | null
          clicks?: number
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          impressions?: number
          leads?: number
          objective?: string | null
          platform?: string | null
          project_id: string
          qualified_leads?: number
          revenue?: number
          site_visits?: number
          spend?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Update: {
          bookings?: number
          budget?: number
          campaign_code?: string | null
          campaign_name?: string
          campaign_type?: string | null
          clicks?: number
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          impressions?: number
          leads?: number
          objective?: string | null
          platform?: string | null
          project_id?: string
          qualified_leads?: number
          revenue?: number
          site_visits?: number
          spend?: number
          start_date?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_partner_projects: {
        Row: {
          assigned_by: string | null
          channel_partner_id: string
          created_at: string
          id: string
          is_active: boolean
          project_id: string
        }
        Insert: {
          assigned_by?: string | null
          channel_partner_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          project_id: string
        }
        Update: {
          assigned_by?: string | null
          channel_partner_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_partner_projects_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_partner_projects_channel_partner_id_fkey"
            columns: ["channel_partner_id"]
            isOneToOne: false
            referencedRelation: "channel_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_partner_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_partners: {
        Row: {
          address: string | null
          alternate_mobile: string | null
          city: string | null
          company_name: string | null
          cp_code: string
          created_at: string
          email: string | null
          gst_number: string | null
          id: string
          kyc_status: Database["public"]["Enums"]["kyc_status"]
          kyc_verified_at: string | null
          kyc_verified_by: string | null
          mobile: string
          name: string
          notes: string | null
          partner_code: string | null
          rera_number: string | null
          sourcing_manager: string | null
          status: Database["public"]["Enums"]["channel_partner_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          alternate_mobile?: string | null
          city?: string | null
          company_name?: string | null
          cp_code: string
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          kyc_verified_at?: string | null
          kyc_verified_by?: string | null
          mobile: string
          name: string
          notes?: string | null
          partner_code?: string | null
          rera_number?: string | null
          sourcing_manager?: string | null
          status?: Database["public"]["Enums"]["channel_partner_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          alternate_mobile?: string | null
          city?: string | null
          company_name?: string | null
          cp_code?: string
          created_at?: string
          email?: string | null
          gst_number?: string | null
          id?: string
          kyc_status?: Database["public"]["Enums"]["kyc_status"]
          kyc_verified_at?: string | null
          kyc_verified_by?: string | null
          mobile?: string
          name?: string
          notes?: string | null
          partner_code?: string | null
          rera_number?: string | null
          sourcing_manager?: string | null
          status?: Database["public"]["Enums"]["channel_partner_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_partners_kyc_verified_by_fkey"
            columns: ["kyc_verified_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_partners_sourcing_manager_fkey"
            columns: ["sourcing_manager"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_partners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_structures: {
        Row: {
          commission_percentage: number | null
          cp_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          fixed_amount: number | null
          id: string
          notes: string | null
          project_id: string | null
          slab_max: number | null
          slab_min: number | null
          status: string
          structure_type: string
          updated_at: string
        }
        Insert: {
          commission_percentage?: number | null
          cp_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          fixed_amount?: number | null
          id?: string
          notes?: string | null
          project_id?: string | null
          slab_max?: number | null
          slab_min?: number | null
          status?: string
          structure_type: string
          updated_at?: string
        }
        Update: {
          commission_percentage?: number | null
          cp_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          fixed_amount?: number | null
          id?: string
          notes?: string | null
          project_id?: string | null
          slab_max?: number | null
          slab_min?: number | null
          status?: string
          structure_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_structures_cp_id_fkey"
            columns: ["cp_id"]
            isOneToOne: false
            referencedRelation: "channel_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_structures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_structures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cp_commission_payouts: {
        Row: {
          amount: number
          commission_id: string
          created_at: string
          id: string
          notes: string | null
          payment_date: string
          payment_mode: string
          recorded_by: string | null
          reference_number: string | null
        }
        Insert: {
          amount: number
          commission_id: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_mode: string
          recorded_by?: string | null
          reference_number?: string | null
        }
        Update: {
          amount?: number
          commission_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          payment_date?: string
          payment_mode?: string
          recorded_by?: string | null
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cp_commission_payouts_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "cp_commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cp_commission_payouts_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cp_commissions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          booking_id: string
          commission_amount: number
          commission_percentage: number | null
          cp_id: string
          created_at: string
          id: string
          paid_amount: number
          payable_amount: number
          payout_date: string | null
          payout_reference: string | null
          pending_amount: number
          remarks: string | null
          status: Database["public"]["Enums"]["commission_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          booking_id: string
          commission_amount?: number
          commission_percentage?: number | null
          cp_id: string
          created_at?: string
          id?: string
          paid_amount?: number
          payable_amount?: number
          payout_date?: string | null
          payout_reference?: string | null
          pending_amount?: number
          remarks?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          booking_id?: string
          commission_amount?: number
          commission_percentage?: number | null
          cp_id?: string
          created_at?: string
          id?: string
          paid_amount?: number
          payable_amount?: number
          payout_date?: string | null
          payout_reference?: string | null
          pending_amount?: number
          remarks?: string | null
          status?: Database["public"]["Enums"]["commission_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cp_commissions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cp_commissions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cp_commissions_cp_id_fkey"
            columns: ["cp_id"]
            isOneToOne: false
            referencedRelation: "channel_partners"
            referencedColumns: ["id"]
          },
        ]
      }
      cp_leads: {
        Row: {
          claim_expires_at: string | null
          cp_id: string
          created_at: string
          id: string
          lead_id: string
          project_id: string
          remarks: string | null
          status: string
          submitted_at: string
          verification_code: string | null
          verified_at: string | null
        }
        Insert: {
          claim_expires_at?: string | null
          cp_id: string
          created_at?: string
          id?: string
          lead_id: string
          project_id: string
          remarks?: string | null
          status?: string
          submitted_at?: string
          verification_code?: string | null
          verified_at?: string | null
        }
        Update: {
          claim_expires_at?: string | null
          cp_id?: string
          created_at?: string
          id?: string
          lead_id?: string
          project_id?: string
          remarks?: string | null
          status?: string
          submitted_at?: string
          verification_code?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cp_leads_cp_id_fkey"
            columns: ["cp_id"]
            isOneToOne: false
            referencedRelation: "channel_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cp_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cp_leads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cp_outreach: {
        Row: {
          channel_partner_id: string | null
          cp_contact_number: string
          cp_firm_name: string
          cp_name: string
          cp_type: string
          created_at: string
          id: string
          leads_source_active_in: string[]
          live_location: string | null
          location: string
          logged_by: string | null
          meet_date: string
          meeting_done: string
          meeting_remarks: string | null
          sourcing_manager_id: string | null
          sourcing_manager_other: string | null
          updated_at: string
        }
        Insert: {
          channel_partner_id?: string | null
          cp_contact_number: string
          cp_firm_name: string
          cp_name: string
          cp_type: string
          created_at?: string
          id?: string
          leads_source_active_in?: string[]
          live_location?: string | null
          location: string
          logged_by?: string | null
          meet_date: string
          meeting_done: string
          meeting_remarks?: string | null
          sourcing_manager_id?: string | null
          sourcing_manager_other?: string | null
          updated_at?: string
        }
        Update: {
          channel_partner_id?: string | null
          cp_contact_number?: string
          cp_firm_name?: string
          cp_name?: string
          cp_type?: string
          created_at?: string
          id?: string
          leads_source_active_in?: string[]
          live_location?: string | null
          location?: string
          logged_by?: string | null
          meet_date?: string
          meeting_done?: string
          meeting_remarks?: string | null
          sourcing_manager_id?: string | null
          sourcing_manager_other?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cp_outreach_channel_partner_id_fkey"
            columns: ["channel_partner_id"]
            isOneToOne: false
            referencedRelation: "channel_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cp_outreach_logged_by_fkey"
            columns: ["logged_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cp_outreach_sourcing_manager_id_fkey"
            columns: ["sourcing_manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          document_type: string
          entity_id: string
          entity_type: string
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          storage_path: string | null
          updated_at: string
          uploaded_by: string | null
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          document_type: string
          entity_id: string
          entity_type: string
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string
          entity_id?: string
          entity_type?: string
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          storage_path?: string | null
          updated_at?: string
          uploaded_by?: string | null
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          address: string | null
          alternate_mobile: string | null
          branch: string | null
          city: string | null
          created_at: string
          date_of_birth: string | null
          department: string | null
          designation: string | null
          emergency_contact_mobile: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employee_code: string
          employee_id: string | null
          employment_status: Database["public"]["Enums"]["employment_status"]
          employment_type: string | null
          first_name: string | null
          gender: string | null
          id: string
          joining_date: string | null
          last_name: string | null
          mobile: string | null
          notes: string | null
          official_email: string | null
          official_mobile: string | null
          personal_email: string | null
          pincode: string | null
          profile_photo: string | null
          reporting_manager: string | null
          state: string | null
          updated_at: string
          user_id: string
          work_location: string | null
        }
        Insert: {
          address?: string | null
          alternate_mobile?: string | null
          branch?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
          designation?: string | null
          emergency_contact_mobile?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_code: string
          employee_id?: string | null
          employment_status?: Database["public"]["Enums"]["employment_status"]
          employment_type?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
          joining_date?: string | null
          last_name?: string | null
          mobile?: string | null
          notes?: string | null
          official_email?: string | null
          official_mobile?: string | null
          personal_email?: string | null
          pincode?: string | null
          profile_photo?: string | null
          reporting_manager?: string | null
          state?: string | null
          updated_at?: string
          user_id: string
          work_location?: string | null
        }
        Update: {
          address?: string | null
          alternate_mobile?: string | null
          branch?: string | null
          city?: string | null
          created_at?: string
          date_of_birth?: string | null
          department?: string | null
          designation?: string | null
          emergency_contact_mobile?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employee_code?: string
          employee_id?: string | null
          employment_status?: Database["public"]["Enums"]["employment_status"]
          employment_type?: string | null
          first_name?: string | null
          gender?: string | null
          id?: string
          joining_date?: string | null
          last_name?: string | null
          mobile?: string | null
          notes?: string | null
          official_email?: string | null
          official_mobile?: string | null
          personal_email?: string | null
          pincode?: string | null
          profile_photo?: string | null
          reporting_manager?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string
          work_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_reporting_manager_fkey"
            columns: ["reporting_manager"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      followups: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_at: string
          followup_type: string
          id: string
          lead_id: string
          notes: string | null
          outcome: string | null
          priority: string
          reminder_at: string | null
          status: Database["public"]["Enums"]["followup_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_at: string
          followup_type?: string
          id?: string
          lead_id: string
          notes?: string | null
          outcome?: string | null
          priority?: string
          reminder_at?: string | null
          status?: Database["public"]["Enums"]["followup_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string
          followup_type?: string
          id?: string
          lead_id?: string
          notes?: string | null
          outcome?: string | null
          priority?: string
          reminder_at?: string | null
          status?: Database["public"]["Enums"]["followup_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "followups_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_holds: {
        Row: {
          created_at: string
          held_at: string
          held_by: string
          hold_until: string
          id: string
          inventory_id: string
          notes: string | null
          release_reason: string | null
          released_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          held_at?: string
          held_by: string
          hold_until: string
          id?: string
          inventory_id: string
          notes?: string | null
          release_reason?: string | null
          released_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          held_at?: string
          held_by?: string
          hold_until?: string
          id?: string
          inventory_id?: string
          notes?: string | null
          release_reason?: string | null
          released_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_holds_held_by_fkey"
            columns: ["held_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_holds_inventory_id_fkey"
            columns: ["inventory_id"]
            isOneToOne: false
            referencedRelation: "project_inventory"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          activity_date: string
          activity_type: string
          created_at: string
          description: string | null
          id: string
          lead_id: string
          metadata: Json
          outcome: string | null
          performed_by: string | null
        }
        Insert: {
          activity_date?: string
          activity_type: string
          created_at?: string
          description?: string | null
          id?: string
          lead_id: string
          metadata?: Json
          outcome?: string | null
          performed_by?: string | null
        }
        Update: {
          activity_date?: string
          activity_type?: string
          created_at?: string
          description?: string | null
          id?: string
          lead_id?: string
          metadata?: Json
          outcome?: string | null
          performed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lead_id: string
          note: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id: string
          note: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          alternate_mobile: string | null
          budget: string | null
          budget_max: number | null
          budget_min: number | null
          buying_timeline: string | null
          campaign_id: string | null
          channel_partner_id: string | null
          city: string | null
          configuration: string | null
          created_at: string
          created_by: string | null
          customer_name: string
          email: string | null
          family_status: string | null
          id: string
          last_contact_at: string | null
          lead_number: string
          lead_score: number
          locality: string | null
          lost_reason: string | null
          mobile: string
          next_followup_at: string | null
          notes: string | null
          occupation: string | null
          owner_id: string | null
          preferred_language: string | null
          project_id: string
          residence_address: string | null
          source: string | null
          sourcing_manager_id: string | null
          status: Database["public"]["Enums"]["lead_status"]
          sub_status: string | null
          telecaller_id: string | null
          updated_at: string
          visit_date: string | null
          visit_type: string | null
        }
        Insert: {
          alternate_mobile?: string | null
          budget?: string | null
          budget_max?: number | null
          budget_min?: number | null
          buying_timeline?: string | null
          campaign_id?: string | null
          channel_partner_id?: string | null
          city?: string | null
          configuration?: string | null
          created_at?: string
          created_by?: string | null
          customer_name: string
          email?: string | null
          family_status?: string | null
          id?: string
          last_contact_at?: string | null
          lead_number: string
          lead_score?: number
          locality?: string | null
          lost_reason?: string | null
          mobile: string
          next_followup_at?: string | null
          notes?: string | null
          occupation?: string | null
          owner_id?: string | null
          preferred_language?: string | null
          project_id: string
          residence_address?: string | null
          source?: string | null
          sourcing_manager_id?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          sub_status?: string | null
          telecaller_id?: string | null
          updated_at?: string
          visit_date?: string | null
          visit_type?: string | null
        }
        Update: {
          alternate_mobile?: string | null
          budget?: string | null
          budget_max?: number | null
          budget_min?: number | null
          buying_timeline?: string | null
          campaign_id?: string | null
          channel_partner_id?: string | null
          city?: string | null
          configuration?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string
          email?: string | null
          family_status?: string | null
          id?: string
          last_contact_at?: string | null
          lead_number?: string
          lead_score?: number
          locality?: string | null
          lost_reason?: string | null
          mobile?: string
          next_followup_at?: string | null
          notes?: string | null
          occupation?: string | null
          owner_id?: string | null
          preferred_language?: string | null
          project_id?: string
          residence_address?: string | null
          source?: string | null
          sourcing_manager_id?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          sub_status?: string | null
          telecaller_id?: string | null
          updated_at?: string
          visit_date?: string | null
          visit_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_channel_partner_id_fkey"
            columns: ["channel_partner_id"]
            isOneToOne: false
            referencedRelation: "channel_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          employee_id: string
          end_date: string
          id: string
          leave_type: string
          notes: string | null
          purpose: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
        }
        Insert: {
          created_at?: string
          employee_id: string
          end_date: string
          id?: string
          leave_type?: string
          notes?: string | null
          purpose?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
        }
        Update: {
          created_at?: string
          employee_id?: string
          end_date?: string
          id?: string
          leave_type?: string
          notes?: string | null
          purpose?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      loss_logs: {
        Row: {
          booking_amount: number
          booking_id: string
          created_at: string
          forfeited_amount: number
          id: string
          reason: string | null
          recorded_by: string | null
          refunded_amount: number
        }
        Insert: {
          booking_amount?: number
          booking_id: string
          created_at?: string
          forfeited_amount?: number
          id?: string
          reason?: string | null
          recorded_by?: string | null
          refunded_amount?: number
        }
        Update: {
          booking_amount?: number
          booking_id?: string
          created_at?: string
          forfeited_amount?: number
          id?: string
          reason?: string | null
          recorded_by?: string | null
          refunded_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "loss_logs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          created_at: string
          duration_minutes: number | null
          employee_id: string | null
          id: string
          lead_id: string | null
          location: string | null
          meeting_type: string
          notes: string | null
          organizer_id: string | null
          outcome: string | null
          project_id: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["meeting_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_minutes?: number | null
          employee_id?: string | null
          id?: string
          lead_id?: string | null
          location?: string | null
          meeting_type: string
          notes?: string | null
          organizer_id?: string | null
          outcome?: string | null
          project_id?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["meeting_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_minutes?: number | null
          employee_id?: string | null
          id?: string
          lead_id?: string | null
          location?: string | null
          meeting_type?: string
          notes?: string | null
          organizer_id?: string | null
          outcome?: string | null
          project_id?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["meeting_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string | null
          notification_type: string
          read_at: string | null
          related_entity: string | null
          related_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          notification_type: string
          read_at?: string | null
          related_entity?: string | null
          related_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string | null
          notification_type?: string
          read_at?: string | null
          related_entity?: string | null
          related_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_name: string | null
          booking_id: string
          cheque_number: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          payment_mode: string | null
          payment_number: string
          payment_type: string
          receipt_document: string | null
          received_date: string | null
          remarks: string | null
          status: Database["public"]["Enums"]["payment_status"]
          transaction_reference: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          bank_name?: string | null
          booking_id: string
          cheque_number?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          payment_mode?: string | null
          payment_number: string
          payment_type?: string
          receipt_document?: string | null
          received_date?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_reference?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_name?: string | null
          booking_id?: string
          cheque_number?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          payment_mode?: string | null
          payment_number?: string
          payment_type?: string
          receipt_document?: string | null
          received_date?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          action: Database["public"]["Enums"]["permission_action"]
          created_at: string
          description: string | null
          id: string
          module: string
        }
        Insert: {
          action: Database["public"]["Enums"]["permission_action"]
          created_at?: string
          description?: string | null
          id?: string
          module: string
        }
        Update: {
          action?: Database["public"]["Enums"]["permission_action"]
          created_at?: string
          description?: string | null
          id?: string
          module?: string
        }
        Relationships: []
      }
      project_floors: {
        Row: {
          created_at: string
          floor_name: string | null
          floor_number: number
          id: string
          total_units: number | null
          tower_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          floor_name?: string | null
          floor_number: number
          id?: string
          total_units?: number | null
          tower_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          floor_name?: string | null
          floor_number?: number
          id?: string
          total_units?: number | null
          tower_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_floors_tower_id_fkey"
            columns: ["tower_id"]
            isOneToOne: false
            referencedRelation: "project_towers"
            referencedColumns: ["id"]
          },
        ]
      }
      project_inventory: {
        Row: {
          base_price: number
          built_up_area: number | null
          carpet_area: number | null
          configuration: string | null
          created_at: string
          facing: string | null
          floor_id: string
          hold_at: string | null
          hold_by: string | null
          hold_reason: string | null
          hold_until: string | null
          id: string
          notes: string | null
          other_charges: number
          parking_amount: number
          plc_amount: number
          project_id: string
          saleable_area: number | null
          status: Database["public"]["Enums"]["inventory_status"]
          total_price: number | null
          tower_id: string
          unit_number: string
          updated_at: string
        }
        Insert: {
          base_price?: number
          built_up_area?: number | null
          carpet_area?: number | null
          configuration?: string | null
          created_at?: string
          facing?: string | null
          floor_id: string
          hold_at?: string | null
          hold_by?: string | null
          hold_reason?: string | null
          hold_until?: string | null
          id?: string
          notes?: string | null
          other_charges?: number
          parking_amount?: number
          plc_amount?: number
          project_id: string
          saleable_area?: number | null
          status?: Database["public"]["Enums"]["inventory_status"]
          total_price?: number | null
          tower_id: string
          unit_number: string
          updated_at?: string
        }
        Update: {
          base_price?: number
          built_up_area?: number | null
          carpet_area?: number | null
          configuration?: string | null
          created_at?: string
          facing?: string | null
          floor_id?: string
          hold_at?: string | null
          hold_by?: string | null
          hold_reason?: string | null
          hold_until?: string | null
          id?: string
          notes?: string | null
          other_charges?: number
          parking_amount?: number
          plc_amount?: number
          project_id?: string
          saleable_area?: number | null
          status?: Database["public"]["Enums"]["inventory_status"]
          total_price?: number | null
          tower_id?: string
          unit_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_inventory_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "project_floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_inventory_hold_by_fkey"
            columns: ["hold_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_inventory_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_inventory_tower_id_fkey"
            columns: ["tower_id"]
            isOneToOne: false
            referencedRelation: "project_towers"
            referencedColumns: ["id"]
          },
        ]
      }
      project_towers: {
        Row: {
          created_at: string
          id: string
          project_id: string
          status: string
          total_floors: number | null
          total_units: number | null
          tower_code: string | null
          tower_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          status?: string
          total_floors?: number | null
          total_units?: number | null
          tower_code?: string | null
          tower_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          status?: string
          total_floors?: number | null
          total_units?: number | null
          tower_code?: string | null
          tower_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_towers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          builder_name: string | null
          city: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          latitude: number | null
          locality: string | null
          longitude: number | null
          mandate_end_date: string | null
          mandate_start_date: string | null
          pincode: string | null
          possession_date: string | null
          project_code: string
          project_name: string
          state: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          builder_name?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          mandate_end_date?: string | null
          mandate_start_date?: string | null
          pincode?: string | null
          possession_date?: string | null
          project_code: string
          project_name: string
          state?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          builder_name?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          mandate_end_date?: string | null
          mandate_start_date?: string | null
          pincode?: string | null
          possession_date?: string | null
          project_code?: string
          project_name?: string
          state?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission_id: string
          role_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_id: string
          role_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_id?: string
          role_id?: string
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
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          display_name: string
          id: string
          is_system_role: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_name: string
          id?: string
          is_system_role?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_name?: string
          id?: string
          is_system_role?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_visits: {
        Row: {
          actual_arrival_at: string | null
          assigned_to: string | null
          configuration: string | null
          confirmed_at: string | null
          created_at: string
          created_by: string | null
          feedback: string | null
          id: string
          interest_level: string | null
          lead_id: string
          next_followup_at: string | null
          project_id: string
          remarks: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["site_visit_status"]
          updated_at: string
          visitor_count: number
        }
        Insert: {
          actual_arrival_at?: string | null
          assigned_to?: string | null
          configuration?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          feedback?: string | null
          id?: string
          interest_level?: string | null
          lead_id: string
          next_followup_at?: string | null
          project_id: string
          remarks?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["site_visit_status"]
          updated_at?: string
          visitor_count?: number
        }
        Update: {
          actual_arrival_at?: string | null
          assigned_to?: string | null
          configuration?: string | null
          confirmed_at?: string | null
          created_at?: string
          created_by?: string | null
          feedback?: string | null
          id?: string
          interest_level?: string | null
          lead_id?: string
          next_followup_at?: string | null
          project_id?: string
          remarks?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["site_visit_status"]
          updated_at?: string
          visitor_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_visits_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_visits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_by: string | null
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          lead_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          project_id: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          project_id?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department: string | null
          designation: string | null
          email: string | null
          employee_code: string | null
          full_name: string
          id: string
          mobile: string | null
          reports_to: string | null
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          designation?: string | null
          email?: string | null
          employee_code?: string | null
          full_name: string
          id: string
          mobile?: string | null
          reports_to?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          designation?: string | null
          email?: string | null
          employee_code?: string | null
          full_name?: string
          id?: string
          mobile?: string | null
          reports_to?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_project_assignments: {
        Row: {
          assigned_from: string
          assigned_until: string | null
          created_at: string
          id: string
          is_active: boolean
          project_id: string
          role_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_from?: string
          assigned_until?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          project_id: string
          role_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_from?: string
          assigned_until?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          project_id?: string
          role_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_project_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_project_assignments_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_project_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_auth_state: {
        Row: {
          files: Json
          session_id: string
          updated_at: string
        }
        Insert: {
          files?: Json
          session_id?: string
          updated_at?: string
        }
        Update: {
          files?: Json
          session_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_outbox: {
        Row: {
          attempts: number
          campaign_id: string | null
          cp_lead_id: string | null
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          lead_id: string | null
          message: string
          sent_at: string | null
          status: string
          to_phone: string
        }
        Insert: {
          attempts?: number
          campaign_id?: string | null
          cp_lead_id?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          lead_id?: string | null
          message: string
          sent_at?: string | null
          status?: string
          to_phone: string
        }
        Update: {
          attempts?: number
          campaign_id?: string | null
          cp_lead_id?: string | null
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          lead_id?: string | null
          message?: string
          sent_at?: string | null
          status?: string
          to_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_outbox_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_cp_lead_id_fkey"
            columns: ["cp_lead_id"]
            isOneToOne: false
            referencedRelation: "cp_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_outbox_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_session: {
        Row: {
          connected_phone: string | null
          id: string
          last_heartbeat_at: string | null
          pending_command: string | null
          qr_data_url: string | null
          status: string
          updated_at: string
        }
        Insert: {
          connected_phone?: string | null
          id?: string
          last_heartbeat_at?: string | null
          pending_command?: string | null
          qr_data_url?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          connected_phone?: string | null
          id?: string
          last_heartbeat_at?: string | null
          pending_command?: string | null
          qr_data_url?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_leads: { Args: never; Returns: boolean }
      can_manage_project: { Args: { p_project_id: string }; Returns: boolean }
      current_user_has_role: { Args: { p_roles: string[] }; Returns: boolean }
      expire_cp_lead_claims: { Args: never; Returns: undefined }
      has_project_access: { Args: { p_project_id: string }; Returns: boolean }
      is_authenticated: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      normalize_phone: { Args: { p: string }; Returns: string }
      write_audit_log: {
        Args: {
          p_action: string
          p_entity_id: string
          p_entity_type: string
          p_new_data?: Json
          p_old_data?: Json
        }
        Returns: string
      }
    }
    Enums: {
      attendance_status:
        | "present"
        | "absent"
        | "half_day"
        | "late"
        | "leave"
        | "field_visit"
        | "holiday"
      booking_status:
        | "draft"
        | "token_received"
        | "confirmed"
        | "agreement_pending"
        | "agreement_completed"
        | "cancelled"
        | "refunded"
      campaign_status: "draft" | "active" | "paused" | "completed" | "cancelled"
      channel_partner_status:
        | "active"
        | "inactive"
        | "blocked"
        | "pending_approval"
      commission_status:
        | "pending"
        | "approved"
        | "rejected"
        | "partially_paid"
        | "paid"
        | "cancelled"
      employment_status:
        | "active"
        | "on_leave"
        | "notice_period"
        | "inactive"
        | "terminated"
        | "resigned"
      followup_status:
        | "pending"
        | "completed"
        | "missed"
        | "overdue"
        | "cancelled"
      inventory_status:
        | "available"
        | "hold"
        | "booked"
        | "cancelled"
        | "blocked"
        | "sold"
      kyc_status: "pending" | "submitted" | "verified" | "rejected"
      lead_status:
        | "new"
        | "contacted"
        | "interested"
        | "hot"
        | "site_visit_planned"
        | "site_visit_done"
        | "negotiation"
        | "booking_done"
        | "not_reachable"
        | "call_back_later"
        | "lost"
        | "junk"
      meeting_status:
        | "scheduled"
        | "completed"
        | "cancelled"
        | "rescheduled"
        | "no_show"
      payment_status:
        | "pending"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "cancelled"
        | "refunded"
      permission_action:
        | "view"
        | "create"
        | "edit"
        | "delete"
        | "assign"
        | "approve"
        | "export"
      project_status:
        | "planning"
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
      site_visit_status:
        | "planned"
        | "confirmed"
        | "arrived"
        | "completed"
        | "no_show"
        | "rescheduled"
        | "cancelled"
      task_priority: "low" | "normal" | "high" | "urgent"
      task_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "overdue"
      user_status: "active" | "inactive" | "suspended"
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
      attendance_status: [
        "present",
        "absent",
        "half_day",
        "late",
        "leave",
        "field_visit",
        "holiday",
      ],
      booking_status: [
        "draft",
        "token_received",
        "confirmed",
        "agreement_pending",
        "agreement_completed",
        "cancelled",
        "refunded",
      ],
      campaign_status: ["draft", "active", "paused", "completed", "cancelled"],
      channel_partner_status: [
        "active",
        "inactive",
        "blocked",
        "pending_approval",
      ],
      commission_status: [
        "pending",
        "approved",
        "rejected",
        "partially_paid",
        "paid",
        "cancelled",
      ],
      employment_status: [
        "active",
        "on_leave",
        "notice_period",
        "inactive",
        "terminated",
        "resigned",
      ],
      followup_status: [
        "pending",
        "completed",
        "missed",
        "overdue",
        "cancelled",
      ],
      inventory_status: [
        "available",
        "hold",
        "booked",
        "cancelled",
        "blocked",
        "sold",
      ],
      kyc_status: ["pending", "submitted", "verified", "rejected"],
      lead_status: [
        "new",
        "contacted",
        "interested",
        "hot",
        "site_visit_planned",
        "site_visit_done",
        "negotiation",
        "booking_done",
        "not_reachable",
        "call_back_later",
        "lost",
        "junk",
      ],
      meeting_status: [
        "scheduled",
        "completed",
        "cancelled",
        "rescheduled",
        "no_show",
      ],
      payment_status: [
        "pending",
        "partially_paid",
        "paid",
        "overdue",
        "cancelled",
        "refunded",
      ],
      permission_action: [
        "view",
        "create",
        "edit",
        "delete",
        "assign",
        "approve",
        "export",
      ],
      project_status: [
        "planning",
        "active",
        "on_hold",
        "completed",
        "cancelled",
      ],
      site_visit_status: [
        "planned",
        "confirmed",
        "arrived",
        "completed",
        "no_show",
        "rescheduled",
        "cancelled",
      ],
      task_priority: ["low", "normal", "high", "urgent"],
      task_status: [
        "pending",
        "in_progress",
        "completed",
        "cancelled",
        "overdue",
      ],
      user_status: ["active", "inactive", "suspended"],
    },
  },
} as const
