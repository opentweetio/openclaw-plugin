import type {
  AccountStatus,
  AnalyticsOverview,
  Article,
  OpenTweetConfig,
  PaginatedResponse,
  Post,
  UploadResponse,
  XAccountInfo,
} from './types.js';

export class OpenTweetClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config: OpenTweetConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
  }

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const payload = data as { error?: string; details?: string | string[] };
      const errorMessage = payload.error || `OpenTweet API error: ${response.status}`;
      const details = payload.details
        ? Array.isArray(payload.details)
          ? payload.details.join('; ')
          : payload.details
        : '';
      throw new Error(details ? `${errorMessage}. ${details}` : errorMessage);
    }

    return data as T;
  }

  private static query(params: Record<string, string | number | boolean | undefined>): string {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === '') continue;
      sp.set(key, String(value));
    }
    const qs = sp.toString();
    return qs ? `?${qs}` : '';
  }

  // Account

  async getAccountStatus(signal?: AbortSignal): Promise<AccountStatus> {
    return this.request<AccountStatus>('GET', '/me', undefined, signal);
  }

  async listAccounts(signal?: AbortSignal): Promise<{ accounts: XAccountInfo[] }> {
    return this.request<{ accounts: XAccountInfo[] }>('GET', '/accounts', undefined, signal);
  }

  // Posts

  async listPosts(
    params: { status?: string; page?: number; limit?: number; x_account_id?: string } = {},
    signal?: AbortSignal
  ): Promise<PaginatedResponse<Post>> {
    return this.request<PaginatedResponse<Post>>(
      'GET',
      `/posts${OpenTweetClient.query(params)}`,
      undefined,
      signal
    );
  }

  async getPost(id: string, signal?: AbortSignal): Promise<Post> {
    return this.request<Post>('GET', `/posts/${id}`, undefined, signal);
  }

  async createPost(
    data: {
      text: string;
      category?: string;
      scheduled_date?: string;
      is_thread?: boolean;
      thread_tweets?: string[];
      media_urls?: string[];
      publish_now?: boolean;
      x_account_id?: string;
    },
    signal?: AbortSignal
  ): Promise<{ success: boolean; count: number; posts: Post[]; message?: string }> {
    return this.request('POST', '/posts', data as unknown as Record<string, unknown>, signal);
  }

  async updatePost(
    id: string,
    data: {
      text?: string;
      category?: string;
      scheduled_date?: string | null;
      is_thread?: boolean;
      thread_tweets?: string[];
      media_urls?: string[];
    },
    signal?: AbortSignal
  ): Promise<Post> {
    return this.request<Post>('PUT', `/posts/${id}`, data as unknown as Record<string, unknown>, signal);
  }

  async deletePost(
    id: string,
    deleteFromX: boolean,
    signal?: AbortSignal
  ): Promise<{ success: boolean; message: string; x_deleted?: boolean }> {
    const query = deleteFromX ? '' : '?delete_from_x=false';
    return this.request('DELETE', `/posts/${id}${query}`, undefined, signal);
  }

  async schedulePost(
    id: string,
    scheduledDate: string,
    signal?: AbortSignal
  ): Promise<{ success: boolean; id: string; text: string; scheduled_date: string; message: string }> {
    return this.request('POST', `/posts/${id}/schedule`, { scheduled_date: scheduledDate }, signal);
  }

  async publishPost(
    id: string,
    signal?: AbortSignal
  ): Promise<{
    success: boolean;
    id: string;
    status: string;
    text: string;
    x_post_id: string;
    url: string;
    posted_date: string;
    message: string;
  }> {
    return this.request('POST', `/posts/${id}/publish`, undefined, signal);
  }

  // Analytics

  async getAnalyticsOverview(xAccountId?: string, signal?: AbortSignal): Promise<AnalyticsOverview> {
    return this.request<AnalyticsOverview>(
      'GET',
      `/analytics/overview${OpenTweetClient.query({ x_account_id: xAccountId })}`,
      undefined,
      signal
    );
  }

  async getTopPosts(
    params: { sort?: string; days?: number; limit?: number; x_account_id?: string } = {},
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'GET',
      `/analytics/top-posts${OpenTweetClient.query(params)}`,
      undefined,
      signal
    );
  }

  async getBestTimes(xAccountId?: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'GET',
      `/analytics/best-times${OpenTweetClient.query({ x_account_id: xAccountId })}`,
      undefined,
      signal
    );
  }

  // Articles

  async listArticles(
    params: { status?: string; page?: number; limit?: number; x_account_id?: string } = {},
    signal?: AbortSignal
  ): Promise<{ articles: Article[]; pagination?: Record<string, number> }> {
    return this.request(
      'GET',
      `/articles${OpenTweetClient.query(params)}`,
      undefined,
      signal
    );
  }

  async getArticle(id: string, signal?: AbortSignal): Promise<{ article: Article }> {
    return this.request('GET', `/articles/${id}`, undefined, signal);
  }

  async createArticle(
    data: {
      title: string;
      content_markdown: string;
      cover_image_url?: string;
      scheduled_date?: string;
      publish_now?: boolean;
      x_account_id?: string;
    },
    signal?: AbortSignal
  ): Promise<{ article: Article }> {
    return this.request('POST', '/articles', data as unknown as Record<string, unknown>, signal);
  }

  async updateArticle(
    id: string,
    data: {
      title?: string;
      content_markdown?: string;
      cover_image_url?: string;
      scheduled_date?: string | null;
    },
    signal?: AbortSignal
  ): Promise<{ article: Article }> {
    return this.request('PUT', `/articles/${id}`, data as unknown as Record<string, unknown>, signal);
  }

  async deleteArticle(id: string, signal?: AbortSignal): Promise<{ success: boolean }> {
    return this.request('DELETE', `/articles/${id}`, undefined, signal);
  }

  async publishArticle(id: string, signal?: AbortSignal): Promise<{ article: Article }> {
    return this.request('POST', `/articles/${id}/publish`, undefined, signal);
  }

  // Inspiration

  async searchInspiration(queryString: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'GET',
      `/inspiration/search?${queryString}`,
      undefined,
      signal
    );
  }

  async repurposeInspiration(
    data: {
      tweet_text: string;
      tweet_author?: string;
      instructions?: string;
      tone?: string;
      save_as_draft?: boolean;
      x_account_id?: string;
    },
    signal?: AbortSignal
  ): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      'POST',
      '/inspiration/repurpose',
      data as unknown as Record<string, unknown>,
      signal
    );
  }

  // Upload

  async uploadMedia(
    bytes: Uint8Array,
    fileName: string,
    mimeType: string,
    signal?: AbortSignal
  ): Promise<UploadResponse> {
    const formData = new FormData();
    formData.append('file', new Blob([bytes], { type: mimeType }), fileName);

    const response = await fetch(`${this.baseUrl}/api/v1/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
      signal,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error((data as { error?: string }).error || `Upload failed: ${response.status}`);
    }
    return data as UploadResponse;
  }
}
