export type ZoneId = 'hairline' | 'left_temple' | 'right_temple' | 'crown' | 'nape'
export type ZoneStateId = 'calm' | 'watch' | 'get_checked' | 'not_checked'
export type ConsentType = 'health_data' | 'analysis' | 'photo_retention' | 'sharing' | 'reminders'

export const ZONES: ZoneId[] = ['hairline', 'left_temple', 'right_temple', 'crown', 'nape']

export type ConsentState = Record<ConsentType, { granted: boolean; at: string | null; wording_version: string | null }>

export type Me = {
  id: string
  email: string
  display_name: string | null
  role: 'user' | 'advisor'
  onboarded: boolean
  consents: ConsentState
}

export type Health = {
  status: string
  app_env: string
  /** What is actually answering: OpenAI, or Demo AI ("fake"). */
  ai_mode: 'openai' | 'fake'
  /** The AI_MODE setting in backend/.env: auto, openai or fake. */
  ai_mode_setting: 'auto' | 'openai' | 'fake'
  openai_key_set: boolean
  ai_enabled: boolean
  /** The library is embedded for the AI in use, so the Hair Coach can find passages. */
  library_ready: boolean
  rules_version: string
  rules_status: string
  library_includes_drafts: boolean
}

export type Period = {
  id: string
  style_name: string
  style_kind: string
  stage: 'install' | 'wear' | 'take_down' | 'rest' | 'ended'
  install_date: string
  take_down_planned: string | null
  take_down_date: string | null
  rest_until: string | null
  ended_at: string | null
  day: number
}

export type TodayCard = {
  type: 'onboarding' | 'get_checked' | 'checkin' | 'wash_day' | 'take_down' | 'rest' | 'learn'
  title: string
  body?: string
  href: string
  template?: string
  question?: string
  field?: string
  options?: [string, string][]
  needs_consent?: boolean
  article?: string
  primary?: boolean
}

export type Today = { date: string; name: string | null; period: Period | null; cards: TodayCard[] }

export type SourceCard = {
  article_id: string
  title: string
  sources: { name: string; url: string }[]
  status: 'draft' | 'reviewed' | 'retired'
  reviewer: string | null
  review_date: string | null
}

export type CheckinResult =
  | {
      saved: true
      id: string
      outcome: 'all_good' | 'ease_the_pull' | 'too_tight'
      title: string
      body: string
      action: string
      article: SourceCard | null
      rules_version: string
      rules_status: string
      escalate: boolean
      escalation_reasons: string[]
    }
  | { saved: false; support: Support }

export type Support = { message: string; links: { name: string; url: string }[] }

export type CheckinTemplate = {
  title: string
  intro: string
  questions: { field: string; text: string; options: [string, string][] }[]
}

export type CheckIn = {
  id: string
  template: string
  created_at: string
  day_in_style: number | null
  tightness: string | null
  soreness: string | null
  bumps: string | null
  itch: string | null
  edges: string | null
  note: string | null
  outcome: string
  style_period_id: string | null
}

export type CoachReply = {
  id: string
  created_at: string
  question: string
  kind: 'answer' | 'no_reviewed_answer' | 'out_of_scope' | 'see_someone_now' | 'support'
  text: string
  action?: string
  signpost?: boolean
  links?: { name: string; url: string }[]
  sources: SourceCard[]
  demo_ai?: boolean
}

export type MapZone = {
  zone: ZoneId
  name: string
  state: ZoneStateId
  reasons: string[]
  checked_at: string | null
  assessment_id: string | null
  explanation: Explanation | null
}

export type Explanation = {
  text: string
  action: string
  source: 'ai' | 'template'
  cited: number[]
  sources: SourceCard[]
  model?: string
}

export type AssessmentZone = {
  zone: ZoneId
  name: string
  you_said: Record<string, string>
  ai_observed: { data: Record<string, 'visible' | 'not_visible' | 'cant_tell'>; model: string; prompt_version: string } | null
  rules_state: { state: ZoneStateId; reasons: string[]; rule_ids: string[]; rules_version: string } | null
  explanation: Explanation | null
  photo: { id: string; kept: boolean; quality: Quality } | null
}

export type Quality = { ok: boolean; issues: { id: string; text: string }[]; checked: boolean }

export type Assessment = {
  id: string
  kind: 'check' | 'take_down'
  status: 'draft' | 'done'
  created_at: string
  completed_at: string | null
  rules_version: string | null
  zones: AssessmentZone[]
  demo_ai?: boolean
}

export type ZonesContent = {
  zones: { id: ZoneId; name: string; capture: string }[]
  questions: { field: string; text: string; options: [string, string][] }[]
  signs: { id: string; name: string; plain: string }[]
  example_images: { status: string; note: string }
}

export type Goal = {
  id: string
  title: string
  area: string
  status: 'active' | 'reached' | 'paused'
  milestones: { date: string; note: string }[]
  created_at: string
}

export type PlanItem = { id: string; text: string; article: string | null }
export type Plan = {
  intro: string
  intro_source: 'ai' | 'template'
  intro_written_at: string | null
  generated_on: string
  sections: { id: string; title: string; items: PlanItem[]; note?: string }[]
  goals: string[]
  demo_ai?: boolean
}

export type Article = SourceCard & { id: string; summary: string; topics: string[]; body_md?: string }
