/**
 * ⚠ STOPGAP — hand-authored until a Supabase project is linked.
 *
 * Once `pnpm supabase link --project-ref <ref>` has run, replace this entire
 * file with generated output:
 *
 *     pnpm db:types
 *
 * It covers only the tables the UI currently reads. The SQL in
 * supabase/migrations/ is the source of truth; if the two disagree, the SQL is
 * right and this file is stale.
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type AppRole = "user" | "admin" | "super_admin";
export type ExperienceLevel = "beginner" | "junior" | "mid" | "senior" | "staff" | "transition";
export type UserPhase = "onboarding" | "phase1" | "phase2";
export type SkillRankDb = "novice" | "familiar" | "working" | "proficient" | "strong" | "expert";
export type PlanItemStatus = "pending" | "in_progress" | "completed" | "skipped" | "deferred";
export type LoopStageDb =
  | "learn" | "build" | "explain" | "test" | "research" | "apply" | "interview" | "review";
export type WeaknessStatusDb = "open" | "researching" | "retesting" | "resolved" | "dismissed";
export type ContentStatus = "draft" | "in_review" | "published" | "archived";

interface Table<Row, Insert = Partial<Row>, Update = Partial<Row>> {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
}

export interface Database {
  public: {
    Tables: {
      profiles: Table<{
        id: string;
        handle: string | null;
        display_name: string | null;
        avatar_url: string | null;
        role: AppRole;
        timezone: string;
        locale: string;
        plan: string;
        last_active_at: string | null;
        /** Set by soft_delete_account() — see migration 0015. */
        deleted_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      career_profiles: Table<{
        user_id: string;
        role_track_id: string | null;
        experience_level: ExperienceLevel;
        target_markets: string[];
        daily_minutes: number;
        study_days: number[];
        start_date: string | null;
        weeks: number;
        phase: UserPhase;
        phase_started_at: string | null;
        onboarding_step: number;
        onboarding_completed_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      companies: Table<{
        id: string;
        slug: string;
        name: string;
        country: string | null;
        careers_url: string | null;
        created_by: string | null;
        is_public: boolean;
        created_at: string;
      }>;
      target_companies: Table<{
        user_id: string;
        company_id: string;
        priority: number;
        created_at: string;
      }>;
      coding_problems: Table<{
        id: string;
        slug: string;
        title: string;
        pattern: string | null;
        difficulty: number;
        statement_md: string;
        starter_code: Json;
        tests: Json;
        target_complexity: string | null;
        hints: Json;
        estimated_minutes: number;
        status: ContentStatus;
        created_at: string;
        updated_at: string;
      }>;
      coding_problem_skills: Table<{
        problem_id: string;
        skill_id: string;
        weight: number;
      }>;
      role_tracks: Table<{
        id: string;
        slug: string;
        name: string;
        description: string | null;
        is_default: boolean;
        sort_order: number;
        status: ContentStatus;
        created_at: string;
      }>;
      domains: Table<{
        id: string;
        slug: string;
        name: string;
        description: string | null;
        icon: string | null;
        sort_order: number;
        created_at: string;
      }>;
      skills: Table<{
        id: string;
        slug: string;
        domain_id: string;
        name: string;
        summary: string | null;
        difficulty: number;
        status: ContentStatus;
        sort_order: number;
        created_at: string;
        updated_at: string;
      }>;
      role_track_skills: Table<{
        role_track_id: string;
        skill_id: string;
        weight: number;
        target_mastery: number;
        is_critical: boolean;
      }>;
      skill_prerequisites: Table<{
        skill_id: string;
        prereq_skill_id: string;
        strength: number;
      }>;
      user_skills: Table<{
        user_id: string;
        skill_id: string;
        mastery: number;
        raw_mastery: number;
        confidence: number;
        prior_mastery: number;
        rank: SkillRankDb;
        evidence_count: number;
        last_practiced_at: string | null;
        recomputed_at: string;
      }>;
      skill_evidence: Table<{
        id: string;
        user_id: string;
        skill_id: string;
        source_type: string;
        source_id: string | null;
        difficulty: number;
        correctness: number;
        weight: number;
        occurred_at: string;
      }>;
      roadmaps: Table<{
        id: string;
        user_id: string;
        role_track_id: string;
        version: number;
        status: "active" | "superseded" | "draft";
        start_date: string;
        weeks: number;
        daily_minutes: number;
        study_days: number[];
        generator_version: string;
        params: Json;
        generated_at: string;
        created_at: string;
      }>;
      roadmap_weeks: Table<{
        id: string;
        roadmap_id: string;
        week_index: number;
        theme: string;
        domain_id: string | null;
        summary_md: string | null;
        status: PlanItemStatus;
      }>;
      roadmap_items: Table<{
        id: string;
        roadmap_id: string;
        week_index: number;
        skill_id: string | null;
        stage: LoopStageDb;
        item_ref_type: string;
        item_ref_id: string | null;
        planned_minutes: number;
        sort_order: number;
        reason: Json;
        status: PlanItemStatus;
        created_at: string;
      }>;
      daily_plans: Table<{
        id: string;
        user_id: string;
        plan_date: string;
        roadmap_id: string | null;
        week_index: number | null;
        mission_title: string | null;
        planned_minutes: number;
        completed_minutes: number;
        status: PlanItemStatus;
        qualified: boolean;
        generated_at: string;
      }>;
      daily_plan_items: Table<{
        id: string;
        daily_plan_id: string;
        stage: LoopStageDb;
        item_ref_type: string;
        item_ref_id: string | null;
        skill_id: string | null;
        title: string;
        planned_minutes: number;
        xp_available: number;
        status: PlanItemStatus;
        source: "roadmap" | "revision" | "weakness" | "jd";
        sort_order: number;
        completed_at: string | null;
        created_at: string;
      }>;
      topics: Table<{
        id: string;
        slug: string;
        skill_id: string;
        title: string;
        summary: string | null;
        estimated_minutes: number;
        difficulty: number;
        status: ContentStatus;
        version: number;
        sort_order: number;
        created_at: string;
        updated_at: string;
      }>;
      topic_contents: Table<{
        id: string;
        topic_id: string;
        kind: string;
        body_md: string;
        sort_order: number;
        created_at: string;
        updated_at: string;
      }>;
      questions: Table<{
        id: string;
        slug: string;
        topic_id: string | null;
        skill_id: string;
        kind: "mcq" | "short_answer" | "explain" | "followup";
        prompt_md: string;
        difficulty: number;
        choices: Json;
        answer_key: Json;
        rubric: Json;
        expected_points: Json;
        followup_seeds: Json;
        is_interview: boolean;
        estimated_seconds: number;
        status: ContentStatus;
        version: number;
        created_at: string;
        updated_at: string;
      }>;
      question_attempts: Table<{
        id: string;
        user_id: string;
        question_id: string;
        response_text: string | null;
        selected: Json;
        score: number;
        is_correct: boolean;
        ai_eval: Json;
        prompt_version: string | null;
        seconds: number | null;
        hints_used: number;
        attempt_no: number;
        created_at: string;
      }>;
      weaknesses: Table<{
        id: string;
        user_id: string;
        skill_id: string;
        severity: number;
        status: WeaknessStatusDb;
        source_type: string;
        source_id: string | null;
        evidence: Json;
        opened_at: string;
        resolved_at: string | null;
        resolved_by_evidence_id: string | null;
      }>;
      revision_items: Table<{
        id: string;
        user_id: string;
        weakness_id: string | null;
        skill_id: string;
        item_ref_type: string;
        item_ref_id: string | null;
        due_at: string;
        interval_days: number;
        ease: number;
        repetitions: number;
        last_result: boolean | null;
        last_reviewed_at: string | null;
        retired_at: string | null;
        created_at: string;
      }>;
      applications: Table<{
        id: string;
        user_id: string;
        company_id: string | null;
        jd_id: string | null;
        role_title: string;
        status:
          | "saved" | "preparing" | "applied" | "recruiter_screen" | "technical_screen"
          | "technical_interview" | "system_design" | "behavioral" | "final"
          | "offer" | "rejected" | "withdrawn";
        applied_at: string | null;
        next_event_at: string | null;
        notes_md: string | null;
        created_at: string;
        updated_at: string;
      }>;
      application_events: Table<{
        id: string;
        application_id: string;
        user_id: string;
        status: string;
        occurred_at: string;
        note: string | null;
      }>;
      interview_records: Table<{
        id: string;
        user_id: string;
        company_id: string | null;
        role_title: string;
        stage:
          | "recruiter" | "technical_screen" | "technical" | "system_design"
          | "behavioral" | "final" | "take_home";
        occurred_at: string;
        outcome: "passed" | "failed" | "pending" | "withdrawn" | null;
        confidence: number | null;
        notes_md: string | null;
        created_at: string;
        updated_at: string;
      }>;
      interview_record_questions: Table<{
        id: string;
        record_id: string;
        user_id: string;
        question_text: string;
        quality: "strong" | "shaky" | "failed" | "unanswered";
        skill_id: string | null;
        difficulty: number;
        unexpected: boolean;
        weakness_id: string | null;
        created_at: string;
      }>;
      achievements: Table<{
        id: string;
        slug: string;
        name: string;
        description: string;
        category: string;
        criteria: Json;
        xp: number;
        tier: number;
        icon: string | null;
        sort_order: number;
      }>;
      user_achievements: Table<{
        user_id: string;
        achievement_id: string;
        progress: Json;
        unlocked_at: string | null;
      }>;
      coding_attempts: Table<{
        id: string;
        user_id: string;
        problem_id: string;
        language: string;
        code: string | null;
        status: "in_progress" | "passed" | "failed" | "abandoned";
        tests_passed: number;
        tests_total: number;
        seconds: number | null;
        hints_used: number;
        complexity_claim: string | null;
        ai_review: Json;
        created_at: string;
      }>;
      system_design_cases: Table<{
        id: string;
        slug: string;
        title: string;
        brief_md: string;
        constraints: Json;
        traffic_profile: Json;
        rubric: Json;
        /** Never selected by user-facing queries — read via get_reference_architecture(). */
        reference_architecture_md: string | null;
        difficulty: number;
        estimated_minutes: number;
        status: ContentStatus;
        created_at: string;
        updated_at: string;
      }>;
      boss_battles: Table<{
        id: string;
        slug: string;
        title: string;
        scenario_md: string;
        week_hint: number | null;
        rubric: Json;
        xp: number;
        difficulty: number;
        skill_id: string | null;
        status: ContentStatus;
        created_at: string;
      }>;
      system_design_attempts: Table<{
        id: string;
        user_id: string;
        case_id: string;
        submission_md: string | null;
        diagram_mermaid: string | null;
        scores: Json;
        overall_score: number | null;
        ai_feedback: Json;
        submitted_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      boss_battle_attempts: Table<{
        id: string;
        user_id: string;
        battle_id: string;
        analysis_md: string | null;
        scores: Json;
        overall_score: number | null;
        completed_at: string | null;
        created_at: string;
      }>;
      research_notes: Table<{
        id: string;
        user_id: string;
        kind: "notebook" | "experiment";
        title: string;
        topic_id: string | null;
        skill_id: string | null;
        question_md: string | null;
        hypothesis_md: string | null;
        research_md: string | null;
        experiment_md: string | null;
        code_md: string | null;
        result_md: string | null;
        evidence_md: string | null;
        conclusion_md: string | null;
        interview_explanation_md: string | null;
        open_questions_md: string | null;
        confidence: number | null;
        tags: string[];
        status: PlanItemStatus;
        completed_at: string | null;
        created_at: string;
        updated_at: string;
      }>;
      note_links: Table<{
        id: string;
        note_id: string;
        user_id: string;
        item_ref_type: string;
        item_ref_id: string;
        created_at: string;
      }>;
      jd_requirements: Table<{
        id: string;
        jd_id: string;
        user_id: string;
        skill_id: string | null;
        raw_label: string;
        normalized_label: string;
        kind: "required" | "preferred";
        gap: "strong" | "partial" | "gap" | "critical" | null;
        user_mastery_at_parse: number | null;
        created_at: string;
      }>;
      job_descriptions: Table<{
        id: string;
        user_id: string;
        company_id: string | null;
        title: string;
        source_url: string | null;
        raw_text: string;
        parsed: Json;
        parsed_at: string | null;
        prompt_version: string | null;
        created_at: string;
      }>;
      research_tasks: Table<{
        id: string;
        user_id: string;
        weakness_id: string | null;
        skill_id: string;
        prompt_md: string;
        status: PlanItemStatus;
        note_id: string | null;
        completed_at: string | null;
        created_at: string;
      }>;
      explanations: Table<{
        id: string;
        user_id: string;
        topic_id: string | null;
        skill_id: string;
        body_md: string;
        level_claimed: string;
        score: number | null;
        ai_eval: Json;
        created_at: string;
      }>;
      streaks: Table<{
        user_id: string;
        current_streak: number;
        longest_streak: number;
        last_qualified_date: string | null;
        shields: number;
        total_study_days: number;
        total_minutes: number;
        repair_used_at: string | null;
        updated_at: string;
      }>;
      user_progress: Table<{
        user_id: string;
        total_xp: number;
        level: number;
        level_name: string;
        updated_at: string;
      }>;
      xp_transactions: Table<{
        id: string;
        user_id: string;
        amount: number;
        source_type: string;
        source_id: string;
        multiplier: number;
        note: string | null;
        occurred_at: string;
      }>;
      readiness_snapshots: Table<{
        user_id: string;
        snapshot_date: string;
        role_track_id: string | null;
        overall: number;
        by_domain: Json;
        by_dimension: Json;
        components: Json;
        created_at: string;
      }>;
      momentum_snapshots: Table<{
        user_id: string;
        snapshot_date: string;
        score: number;
        components: Json;
      }>;
      ai_usage: Table<{
        id: number;
        user_id: string;
        feature: string;
        model: string;
        input_tokens: number;
        output_tokens: number;
        cost_usd: number;
        occurred_at: string;
      }>;
      user_events: Table<{
        id: number;
        user_id: string;
        name: string;
        payload: Json;
        session_id: string | null;
        occurred_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: {
      record_evidence: {
        Args: {
          p_skill: string;
          p_source_type: string;
          p_source_id: string | null;
          p_difficulty: number;
          p_correctness: number;
        };
        Returns: string;
      };
      consume_rate_limit: {
        Args: {
          p_key: string;
          p_capacity: number;
          p_refill_per_minute: number;
          p_cost?: number;
        };
        Returns: boolean;
      };
      get_reference_architecture: {
        Args: { p_case: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
