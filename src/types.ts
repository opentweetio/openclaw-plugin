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
  created_at: string;
  updated_at?: string;
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
