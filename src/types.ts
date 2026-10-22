export interface OpenTweetConfig {
  apiKey: string;
  baseUrl: string;
}

export interface PaginatedResponse<T> {
  posts: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export type PlatformId = 'x' | 'bluesky' | 'linkedin';

/** Per-network outcome of a publish. `skipped` is not a failure. */
export interface PostResult {
  platform: PlatformId;
  status: 'published' | 'failed' | 'skipped';
  url?: string | null;
  error?: string;
  skipReason?: string;
  skip_reason?: string;
}

export interface Post {
  id: string;
  status: 'draft' | 'scheduled' | 'posted' | 'failed';
  category: string;
  text: string;
  scheduled_date: string | null;
  posted: boolean;
  posted_date: string | null;
  failed: boolean;
  failed_reason?: string;
  is_thread: boolean;
  thread_tweets?: string[];
  media_urls?: string[];
  x_post_id?: string;
  x_account_id?: string | null;
  url?: string | null;
  platforms?: PlatformId[];
  results?: PostResult[];
  created_at: string;
  updated_at?: string;
}

export interface PlatformAccountInfo {
  account_id: string;
  handle: string;
  display_name?: string;
  is_primary: boolean;
  /** This one account is dead even when the platform as a whole is usable. */
  disconnected: boolean;
}

export interface PlatformLimitsInfo {
  max_text_length?: number;
  text_unit?: string;
  max_images?: number;
  max_videos?: number;
  max_thread_parts?: number;
}

/**
 * `connected` means an account row exists. `usable` means we believe we can
 * publish right now. A dead grant is connected but not usable, so both travel.
 */
export interface PlatformStatus {
  platform: PlatformId;
  label?: string;
  connected: boolean;
  usable: boolean;
  needs_reconnect: boolean;
  accounts: PlatformAccountInfo[];
  limits?: PlatformLimitsInfo;
}

/**
 * `default_targets` is where a post that omits `platforms` is ATTEMPTED.
 * `deliverable_targets` is the subset that will actually land. An unusable
 * platform stays in `default_targets` on purpose so it fails visibly.
 */
export interface PlatformsStatus {
  auto_cross_post: boolean;
  default_targets: PlatformId[];
  deliverable_targets: PlatformId[];
  platforms: PlatformStatus[];
}

/**
 * The wire shape. The API emits snake_case, and every key is read under a
 * camelCase twin as well so a casing change upstream cannot silently turn a
 * missing field into a wrong answer.
 */
export interface RawPlatformAccountInfo {
  account_id?: string;
  accountId?: string;
  handle?: string;
  display_name?: string;
  displayName?: string;
  is_primary?: boolean;
  isPrimary?: boolean;
  disconnected?: boolean;
}

export interface RawPlatformLimitsInfo {
  max_text_length?: number;
  maxTextLength?: number;
  text_unit?: string;
  textUnit?: string;
  max_images?: number;
  maxImages?: number;
  max_videos?: number;
  maxVideos?: number;
  max_thread_parts?: number;
  maxThreadParts?: number;
}

export interface RawPlatformStatus {
  platform: PlatformId;
  label?: string;
  connected?: boolean;
  usable?: boolean;
  needs_reconnect?: boolean;
  needsReconnect?: boolean;
  accounts?: RawPlatformAccountInfo[];
  limits?: RawPlatformLimitsInfo | null;
}

export interface RawPlatformsStatus {
  auto_cross_post?: boolean;
  autoCrossPost?: boolean;
  default_targets?: PlatformId[];
  defaultTargets?: PlatformId[];
  deliverable_targets?: PlatformId[];
  deliverableTargets?: PlatformId[];
  platforms?: RawPlatformStatus[];
}

export interface XAccountInfo {
  id: string;
  x_handle: string;
  x_name: string;
  is_primary: boolean;
  nickname: string | null;
  x_subscription_type?: string;
  profile_image_url?: string | null;
}

export interface AccountStatus {
  authenticated: boolean;
  subscription: {
    has_access: boolean;
    status: string;
    is_trialing: boolean;
    trial_ends_at: string | null;
    current_period_ends_at: string | null;
  };
  limits: {
    can_post: boolean;
    posts_published_today: number;
    remaining_posts_today: number;
    daily_limit: number;
  } | null;
  stats: {
    total_posts: number;
    scheduled_posts: number;
    posted_posts: number;
    draft_posts: number;
  };
  accounts?: XAccountInfo[];
}

export interface AnalyticsOverview {
  stats: {
    total_posts_created: number;
    total_posts_published: number;
    total_posts_scheduled: number;
    publishing_rate: number;
    avg_posts_per_week: number;
    most_active_day: string;
    most_active_hour: number;
    total_threads_created: number;
  };
  streaks: {
    current: number;
    longest: number;
    last_posted_date: string | null;
  };
  trends: {
    this_week: number;
    last_week: number;
    this_month: number;
    last_month: number;
  };
  categories: {
    name: string;
    count: number;
    percentage: number;
  }[];
}

export interface UploadResponse {
  url: string;
}

export interface Article {
  id: string;
  title: string;
  content_markdown?: string;
  status: string;
  scheduled_date?: string | null;
  cover_image_url?: string | null;
  x_article_id?: string | null;
  url?: string | null;
  created_at?: string;
}

export interface InspirationTweet {
  id: string;
  text: string;
  author_username: string;
  author_name: string;
  author_followers_count: number;
  public_metrics: {
    like_count: number;
    retweet_count: number;
    reply_count: number;
    impression_count: number;
    bookmark_count: number;
  };
  created_at: string;
}

export interface CsvImportScheduleOptions {
  date_column: string;
  time_column?: string;
  order?: 'dmy' | 'mdy';
}

export interface CsvImportDraft {
  id: string;
  status: 'draft' | 'scheduled';
  scheduled_date: string | null;
  row: number | null;
  text: string;
  media_urls: string[];
  too_long: boolean;
  has_link: boolean;
}

export interface CsvImportResponse {
  success: boolean;
  group_id: string;
  count: number;
  drafts: CsvImportDraft[];
  skipped_rows: number[];
  failed_rows: number[];
  char_limit: number;
  usage: {
    ai_generations_used: number;
    ai_generations_remaining: number;
    daily_limit: number;
  };
  schedule?: {
    date_column: string;
    time_column: string | null;
    order: 'dmy' | 'mdy';
    timezone: string;
    scheduled: number;
    past_rows: number[];
    invalid_rows: number[];
    no_time_rows: number[];
    empty_rows: number[];
  };
}
