import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { Type } from 'typebox';
import { defineToolPlugin } from 'openclaw/plugin-sdk/tool-plugin';
import { OpenTweetClient } from './api-client.js';
import type { Article, InspirationTweet, PlatformsStatus, Post, RawPlatformsStatus } from './types.js';

const DEFAULT_BASE_URL = 'https://opentweet.io';

const configSchema = Type.Object(
  {
    apiKey: Type.String({
      description: 'OpenTweet API key. Create one at https://opentweet.io/dashboard/api-keys',
    }),
    baseUrl: Type.Optional(
      Type.String({
        description: 'OpenTweet base URL. Only change this for self-hosted instances.',
      })
    ),
  },
  { additionalProperties: false }
);

type Config = {
  apiKey: string;
  baseUrl?: string;
};

function createClient(config: Config): OpenTweetClient {
  if (!config.apiKey) {
    throw new Error(
      'OpenTweet API key missing. Set plugins.entries.opentweet.config.apiKey in openclaw.json.'
    );
  }
  return new OpenTweetClient({
    apiKey: config.apiKey,
    baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
  });
}

const PostSummary = Type.Object(
  {
    id: Type.String(),
    status: Type.String(),
    text: Type.String(),
    is_thread: Type.Boolean(),
    scheduled_date: Type.Optional(Type.String()),
    posted_date: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
    x_account_id: Type.Optional(Type.String()),
    platforms: Type.Optional(Type.Array(Type.String())),
    results: Type.Optional(
      Type.Array(
        Type.Object(
          {
            platform: Type.String(),
            status: Type.String(),
            url: Type.Optional(Type.String()),
            error: Type.Optional(Type.String()),
            skip_reason: Type.Optional(Type.String()),
          },
          { additionalProperties: false }
        )
      )
    ),
  },
  { additionalProperties: false }
);

function summarizePost(post: Post) {
  return {
    id: post.id,
    status: post.status,
    text: post.text,
    is_thread: Boolean(post.is_thread),
    scheduled_date: post.scheduled_date ?? undefined,
    posted_date: post.posted_date ?? undefined,
    url: post.url ?? undefined,
    x_account_id: post.x_account_id ?? undefined,
    platforms: post.platforms ?? undefined,
    results: post.results?.map((r) => ({
      platform: r.platform,
      status: r.status,
      url: r.url ?? undefined,
      error: r.error,
      skip_reason: r.skipReason ?? r.skip_reason,
    })),
  };
}

/**
 * Folds the wire response into the canonical snake_case shape, reading every key
 * under both casings. A missing `usable` falls back to `connected` rather than
 * to false, so an older server still reports a working network as working.
 */
function normalizePlatforms(raw: RawPlatformsStatus): PlatformsStatus {
  return {
    auto_cross_post: raw.auto_cross_post ?? raw.autoCrossPost ?? false,
    default_targets: raw.default_targets ?? raw.defaultTargets ?? [],
    deliverable_targets: raw.deliverable_targets ?? raw.deliverableTargets ?? [],
    platforms: (raw.platforms ?? []).map((p) => {
      const connected = p.connected ?? false;
      const l = p.limits;
      return {
        platform: p.platform,
        label: p.label,
        connected,
        usable: p.usable ?? connected,
        needs_reconnect: p.needs_reconnect ?? p.needsReconnect ?? false,
        accounts: (p.accounts ?? []).map((a) => ({
          account_id: a.account_id ?? a.accountId ?? '',
          handle: a.handle ?? '',
          display_name: a.display_name ?? a.displayName,
          is_primary: a.is_primary ?? a.isPrimary ?? false,
          disconnected: a.disconnected ?? false,
        })),
        limits: l
          ? {
              max_text_length: l.max_text_length ?? l.maxTextLength,
              text_unit: l.text_unit ?? l.textUnit,
              max_images: l.max_images ?? l.maxImages,
              max_videos: l.max_videos ?? l.maxVideos,
              max_thread_parts: l.max_thread_parts ?? l.maxThreadParts,
            }
          : undefined,
      };
    }),
  };
}

const ArticleSummary = Type.Object(
  {
    id: Type.String(),
    title: Type.String(),
    status: Type.String(),
    scheduled_date: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
    content_markdown: Type.Optional(Type.String()),
  },
  { additionalProperties: false }
);

function summarizeArticle(article: Article, includeBody = false) {
  return {
    id: article.id,
    title: article.title,
    status: article.status,
    scheduled_date: article.scheduled_date ?? undefined,
    url: article.url ?? undefined,
    content_markdown: includeBody ? article.content_markdown ?? undefined : undefined,
  };
}

const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
};

function mimeTypeFor(fileName: string): string {
  const mime = MIME_TYPES[extname(fileName).toLowerCase()];
  if (!mime) {
    throw new Error(
      `Unsupported media type for "${fileName}". Supported: ${Object.keys(MIME_TYPES).join(', ')}`
    );
  }
  return mime;
}

export default defineToolPlugin({
  id: 'opentweet',
  name: 'OpenTweet',
  description:
    'Schedule and publish X and Bluesky posts, threads and long-form articles, upload media, read analytics, and find content inspiration through OpenTweet.',
  configSchema,
  tools: (tool) => [
    tool({
      name: 'opentweet_accounts',
      label: 'OpenTweet Accounts',
      description:
        'List the connected X accounts, subscription status and remaining daily posting quota. Call this first when the user has more than one X account, to resolve the right x_account_id.',
      parameters: Type.Object({}),
      outputSchema: Type.Object(
        {
          subscription_status: Type.String(),
          has_access: Type.Boolean(),
          is_trialing: Type.Boolean(),
          remaining_posts_today: Type.Optional(Type.Number()),
          daily_limit: Type.Optional(Type.Number()),
          scheduled_posts: Type.Number(),
          accounts: Type.Array(
            Type.Object(
              {
                id: Type.String(),
                handle: Type.String(),
                name: Type.String(),
                is_primary: Type.Boolean(),
                nickname: Type.Optional(Type.String()),
              },
              { additionalProperties: false }
            )
          ),
        },
        { additionalProperties: false }
      ),
      async execute(_params, config: Config, context) {
        context.signal?.throwIfAborted();
        const client = createClient(config);
        const [status, accounts] = await Promise.all([
          client.getAccountStatus(context.signal),
          client.listAccounts(context.signal).catch(() => ({ accounts: [] })),
        ]);

        const list = accounts.accounts?.length ? accounts.accounts : status.accounts ?? [];

        return {
          subscription_status: status.subscription.status,
          has_access: status.subscription.has_access,
          is_trialing: status.subscription.is_trialing,
          remaining_posts_today: status.limits?.remaining_posts_today,
          daily_limit: status.limits?.daily_limit,
          scheduled_posts: status.stats.scheduled_posts,
          accounts: list.map((account) => ({
            id: account.id,
            handle: account.x_handle,
            name: account.x_name,
            is_primary: Boolean(account.is_primary),
            nickname: account.nickname ?? undefined,
          })),
        };
      },
    }),

    tool({
      name: 'opentweet_list_platforms',
      label: 'OpenTweet Platforms',
      description:
        'Show cross-posting state: which networks are connected, which can actually publish right now, whether auto cross-post is on, and where a post that omits the platforms parameter would go. Reports both what such a post is attempted on (default_targets) and the subset that will actually land (deliverable_targets). Call this before posting when the user has not said which network they mean. Read connected and usable separately: a network whose authorisation died is still connected but cannot publish.',
      parameters: Type.Object({}),
      outputSchema: Type.Object(
        {
          auto_cross_post: Type.Boolean(),
          default_targets: Type.Array(Type.String(), {
            description: 'Networks a post that omits platforms is attempted on.',
          }),
          deliverable_targets: Type.Array(Type.String(), {
            description:
              'The subset of default_targets that will actually land. Anything in default_targets but not here is attempted and expected to fail, which is deliberate so the failure is recorded rather than silently dropped.',
          }),
          platforms: Type.Array(
            Type.Object(
              {
                platform: Type.String(),
                label: Type.Optional(Type.String()),
                connected: Type.Boolean(),
                usable: Type.Boolean(),
                needs_reconnect: Type.Optional(Type.Boolean()),
                accounts: Type.Optional(
                  Type.Array(
                    Type.Object(
                      {
                        account_id: Type.String(),
                        handle: Type.String(),
                        display_name: Type.Optional(Type.String()),
                        is_primary: Type.Optional(Type.Boolean()),
                        disconnected: Type.Optional(Type.Boolean()),
                      },
                      { additionalProperties: false }
                    )
                  )
                ),
                limits: Type.Optional(
                  Type.Object(
                    {
                      max_text_length: Type.Optional(Type.Number()),
                      text_unit: Type.Optional(Type.String()),
                      max_images: Type.Optional(Type.Number()),
                      max_videos: Type.Optional(Type.Number()),
                      max_thread_parts: Type.Optional(Type.Number()),
                    },
                    { additionalProperties: false }
                  )
                ),
              },
              { additionalProperties: false }
            )
          ),
        },
        { additionalProperties: false }
      ),
      async execute(_params, config: Config, context) {
        context.signal?.throwIfAborted();
        const client = createClient(config);
        const data = normalizePlatforms(await client.getCrossPosting(context.signal));

        return {
          auto_cross_post: data.auto_cross_post,
          default_targets: data.default_targets,
          deliverable_targets: data.deliverable_targets,
          platforms: data.platforms.map((p) => ({
            platform: p.platform,
            label: p.label,
            connected: p.connected,
            usable: p.usable,
            needs_reconnect: p.needs_reconnect,
            accounts: p.accounts,
            limits: p.limits,
          })),
        };
      },
    }),

    tool({
      name: 'opentweet_post',
      label: 'OpenTweet Post',
      description:
        'Create a single post or a thread. Publishes immediately when publish_now is true, schedules it when scheduled_date is set, and otherwise saves a draft. Pass thread_tweets to create a thread, where text is the first tweet. Use platforms to cross-post the same content to X and Bluesky in one call. Omitting platforms hands targeting to the account auto cross-post setting rather than pinning the post to X, so call opentweet_list_platforms first when that matters.',
      parameters: Type.Object({
        text: Type.String({ description: 'The post text, or the first tweet of a thread.' }),
        thread_tweets: Type.Optional(
          Type.Array(Type.String(), {
            description: 'Remaining tweets of the thread, in order, excluding the first one.',
          })
        ),
        scheduled_date: Type.Optional(
          Type.String({ description: 'ISO 8601 datetime to publish at, for example 2026-09-01T14:30:00Z.' })
        ),
        publish_now: Type.Optional(
          Type.Boolean({ description: 'Publish immediately instead of scheduling. Defaults to false.' })
        ),
        media_urls: Type.Optional(
          Type.Array(Type.String(), {
            description: 'Media URLs returned by opentweet_upload_media, attached to the first tweet.',
          })
        ),
        category: Type.Optional(Type.String({ description: 'Content category label.' })),
        x_account_id: Type.Optional(
          Type.String({ description: 'Target X account id from opentweet_accounts, for multi-account users.' })
        ),
        platforms: Type.Optional(
          Type.Array(Type.Union([Type.Literal('x'), Type.Literal('bluesky')]), {
            description:
              'Networks to post to. Pass ["x", "bluesky"] to publish the same content to both in one call, or any non-empty subset such as ["bluesky"]. An explicit list is always honoured exactly. Leaving this out is not the same as pinning to X: the post then follows the account auto cross-post setting, which sends it to every connected network when that setting is on. A network the user has not connected comes back as skipped rather than failing the call.',
          })
        ),
      }),
      outputSchema: Type.Object(
        {
          created: Type.Number(),
          posts: Type.Array(PostSummary),
          message: Type.Optional(Type.String()),
        },
        { additionalProperties: false }
      ),
      async execute(params, config: Config, context) {
        context.signal?.throwIfAborted();
        const client = createClient(config);
        const threadTweets = params.thread_tweets ?? [];

        const result = await client.createPost(
          {
            text: params.text,
            category: params.category,
            scheduled_date: params.scheduled_date,
            is_thread: threadTweets.length > 0,
            thread_tweets: threadTweets.length > 0 ? threadTweets : undefined,
            media_urls: params.media_urls,
            publish_now: params.publish_now,
            x_account_id: params.x_account_id,
            platforms: params.platforms,
          },
          context.signal
        );

        return {
          created: result.count ?? result.posts?.length ?? 0,
          posts: (result.posts ?? []).map(summarizePost),
          message: result.message,
        };
      },
    }),

    tool({
      name: 'opentweet_list_posts',
      label: 'OpenTweet List Posts',
      description:
        'List posts in the OpenTweet queue. Filter by status to see drafts, what is scheduled, what already went out, or what failed.',
      parameters: Type.Object({
        status: Type.Optional(
          Type.Union(
            [
              Type.Literal('draft'),
              Type.Literal('scheduled'),
              Type.Literal('posted'),
              Type.Literal('failed'),
            ],
            { description: 'Filter by post status.' }
          )
        ),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, description: 'Defaults to 20.' })),
        page: Type.Optional(Type.Integer({ minimum: 1 })),
        x_account_id: Type.Optional(Type.String()),
      }),
      outputSchema: Type.Object(
        {
          total: Type.Number(),
          page: Type.Number(),
          pages: Type.Number(),
          posts: Type.Array(PostSummary),
        },
        { additionalProperties: false }
      ),
      async execute(params, config: Config, context) {
        context.signal?.throwIfAborted();
        const client = createClient(config);
        const result = await client.listPosts(
          {
            status: params.status,
            limit: params.limit ?? 20,
            page: params.page,
            x_account_id: params.x_account_id,
          },
          context.signal
        );

        return {
          total: result.pagination?.total ?? result.posts.length,
          page: result.pagination?.page ?? 1,
          pages: result.pagination?.pages ?? 1,
          posts: (result.posts ?? []).map(summarizePost),
        };
      },
    }),

    tool({
      name: 'opentweet_update_post',
      label: 'OpenTweet Update Post',
      description:
        'Act on an existing post: edit its text or media, schedule it for a new time, publish it right now, or delete it. Use opentweet_list_posts first to find the post id.',
      parameters: Type.Object({
        id: Type.String({ description: 'The post id.' }),
        action: Type.Union(
          [
            Type.Literal('edit'),
            Type.Literal('schedule'),
            Type.Literal('publish'),
            Type.Literal('delete'),
          ],
          { description: 'What to do with the post.' }
        ),
        text: Type.Optional(Type.String({ description: 'New text, for action "edit".' })),
        thread_tweets: Type.Optional(
          Type.Array(Type.String(), { description: 'Replacement thread tweets, for action "edit".' })
        ),
        media_urls: Type.Optional(Type.Array(Type.String(), { description: 'Replacement media, for action "edit".' })),
        scheduled_date: Type.Optional(
          Type.String({ description: 'ISO 8601 datetime, required for action "schedule".' })
        ),
        delete_from_x: Type.Optional(
          Type.Boolean({
            description: 'For action "delete" on an already published post, also delete it from X. Defaults to true.',
          })
        ),
      }),
      outputSchema: Type.Object(
        {
          action: Type.String(),
          id: Type.String(),
          status: Type.Optional(Type.String()),
          url: Type.Optional(Type.String()),
          scheduled_date: Type.Optional(Type.String()),
          message: Type.Optional(Type.String()),
        },
        { additionalProperties: false }
      ),
      async execute(params, config: Config, context) {
        context.signal?.throwIfAborted();
        const client = createClient(config);

        if (params.action === 'edit') {
          const threadTweets = params.thread_tweets;
          const updated = await client.updatePost(
            params.id,
            {
              text: params.text,
              thread_tweets: threadTweets,
              is_thread: threadTweets ? threadTweets.length > 0 : undefined,
              media_urls: params.media_urls,
              scheduled_date: params.scheduled_date,
            },
            context.signal
          );
          return {
            action: 'edit',
            id: updated.id,
            status: updated.status,
            url: updated.url ?? undefined,
            scheduled_date: updated.scheduled_date ?? undefined,
          };
        }

        if (params.action === 'schedule') {
          if (!params.scheduled_date) {
            throw new Error('scheduled_date is required when action is "schedule".');
          }
          const scheduled = await client.schedulePost(params.id, params.scheduled_date, context.signal);
          return {
            action: 'schedule',
            id: scheduled.id,
            status: 'scheduled',
            scheduled_date: scheduled.scheduled_date,
            message: scheduled.message,
          };
        }

        if (params.action === 'publish') {
          const published = await client.publishPost(params.id, context.signal);
          return {
            action: 'publish',
            id: published.id,
            status: published.status,
            url: published.url,
            message: published.message,
          };
        }

        const deleted = await client.deletePost(params.id, params.delete_from_x ?? true, context.signal);
        return {
          action: 'delete',
          id: params.id,
          message: deleted.message,
        };
      },
    }),

    tool({
      name: 'opentweet_upload_media',
      label: 'OpenTweet Upload Media',
      description:
        'Upload an image or video to OpenTweet and get back a media URL to pass into opentweet_post. Accepts a local file path or a remote URL.',
      parameters: Type.Object({
        file_path: Type.Optional(Type.String({ description: 'Absolute path to a local image or video file.' })),
        url: Type.Optional(Type.String({ description: 'Remote URL to download and upload instead of a local file.' })),
        file_name: Type.Optional(
          Type.String({ description: 'Override the file name, including the extension.' })
        ),
      }),
      outputSchema: Type.Object(
        {
          url: Type.String(),
          file_name: Type.String(),
          mime_type: Type.String(),
        },
        { additionalProperties: false }
      ),
      async execute(params, config: Config, context) {
        context.signal?.throwIfAborted();
        const client = createClient(config);

        if (!params.file_path && !params.url) {
          throw new Error('Provide either file_path or url.');
        }

        let bytes: Uint8Array;
        let fileName: string;

        if (params.file_path) {
          bytes = new Uint8Array(await readFile(params.file_path));
          fileName = params.file_name ?? basename(params.file_path);
        } else {
          const response = await fetch(params.url as string, { signal: context.signal });
          if (!response.ok) {
            throw new Error(`Could not download ${params.url}: ${response.status}`);
          }
          bytes = new Uint8Array(await response.arrayBuffer());
          fileName = params.file_name ?? basename(new URL(params.url as string).pathname);
        }

        const mimeType = mimeTypeFor(fileName);
        const uploaded = await client.uploadMedia(bytes, fileName, mimeType, context.signal);

        return { url: uploaded.url, file_name: fileName, mime_type: mimeType };
      },
    }),

    tool({
      name: 'opentweet_analytics',
      label: 'OpenTweet Analytics',
      description:
        'Read OpenTweet analytics. Use report "overview" for publishing stats and streaks, "top_posts" for the best performing posts, and "best_times" for recommended posting times.',
      parameters: Type.Object({
        report: Type.Union(
          [Type.Literal('overview'), Type.Literal('top_posts'), Type.Literal('best_times')],
          { description: 'Which report to fetch.' }
        ),
        days: Type.Optional(
          Type.Integer({ minimum: 1, maximum: 365, description: 'Lookback window for top_posts. Defaults to 30.' })
        ),
        limit: Type.Optional(
          Type.Integer({ minimum: 1, maximum: 50, description: 'Result count for top_posts. Defaults to 10.' })
        ),
        x_account_id: Type.Optional(Type.String()),
      }),
      outputSchema: Type.Object(
        {
          report: Type.String(),
          data: Type.Any(),
        },
        { additionalProperties: false }
      ),
      async execute(params, config: Config, context) {
        context.signal?.throwIfAborted();
        const client = createClient(config);

        if (params.report === 'overview') {
          const overview = await client.getAnalyticsOverview(params.x_account_id, context.signal);
          return {
            report: 'overview',
            data: {
              stats: overview.stats,
              streaks: overview.streaks,
              trends: overview.trends,
              categories: overview.categories,
            },
          };
        }

        if (params.report === 'top_posts') {
          const top = await client.getTopPosts(
            {
              days: params.days ?? 30,
              limit: params.limit ?? 10,
              x_account_id: params.x_account_id,
            },
            context.signal
          );
          return { report: 'top_posts', data: top };
        }

        const bestTimes = await client.getBestTimes(params.x_account_id, context.signal);
        return { report: 'best_times', data: bestTimes };
      },
    }),

    tool({
      name: 'opentweet_article',
      label: 'OpenTweet Article',
      description:
        'Manage long-form X articles written in markdown. Create, read, update, publish or delete. Publishing an article to X requires an X Premium subscription on the connected account.',
      parameters: Type.Object({
        action: Type.Union(
          [
            Type.Literal('list'),
            Type.Literal('get'),
            Type.Literal('create'),
            Type.Literal('update'),
            Type.Literal('publish'),
            Type.Literal('delete'),
          ],
          { description: 'What to do.' }
        ),
        id: Type.Optional(Type.String({ description: 'Article id, required for every action except list and create.' })),
        title: Type.Optional(Type.String({ description: 'Article title, required for create.' })),
        content_markdown: Type.Optional(
          Type.String({ description: 'Article body in markdown, required for create.' })
        ),
        cover_image_url: Type.Optional(Type.String({ description: 'Cover image URL from opentweet_upload_media.' })),
        scheduled_date: Type.Optional(Type.String({ description: 'ISO 8601 datetime to publish the article at.' })),
        publish_now: Type.Optional(Type.Boolean({ description: 'Publish immediately on create.' })),
        status: Type.Optional(Type.String({ description: 'Status filter for list.' })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, description: 'Result count for list.' })),
        x_account_id: Type.Optional(Type.String()),
      }),
      outputSchema: Type.Object(
        {
          action: Type.String(),
          articles: Type.Optional(Type.Array(ArticleSummary)),
          article: Type.Optional(ArticleSummary),
          success: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false }
      ),
      async execute(params, config: Config, context) {
        context.signal?.throwIfAborted();
        const client = createClient(config);

        const requireId = (action: string): string => {
          if (!params.id) throw new Error(`id is required when action is "${action}".`);
          return params.id;
        };

        switch (params.action) {
          case 'list': {
            const result = await client.listArticles(
              {
                status: params.status,
                limit: params.limit ?? 20,
                x_account_id: params.x_account_id,
              },
              context.signal
            );
            return {
              action: 'list',
              articles: (result.articles ?? []).map((article) => summarizeArticle(article)),
            };
          }
          case 'get': {
            const result = await client.getArticle(requireId('get'), context.signal);
            return { action: 'get', article: summarizeArticle(result.article, true) };
          }
          case 'create': {
            if (!params.title || !params.content_markdown) {
              throw new Error('title and content_markdown are required when action is "create".');
            }
            const result = await client.createArticle(
              {
                title: params.title,
                content_markdown: params.content_markdown,
                cover_image_url: params.cover_image_url,
                scheduled_date: params.scheduled_date,
                publish_now: params.publish_now,
                x_account_id: params.x_account_id,
              },
              context.signal
            );
            return { action: 'create', article: summarizeArticle(result.article) };
          }
          case 'update': {
            const result = await client.updateArticle(
              requireId('update'),
              {
                title: params.title,
                content_markdown: params.content_markdown,
                cover_image_url: params.cover_image_url,
                scheduled_date: params.scheduled_date,
              },
              context.signal
            );
            return { action: 'update', article: summarizeArticle(result.article) };
          }
          case 'publish': {
            const result = await client.publishArticle(requireId('publish'), context.signal);
            return { action: 'publish', article: summarizeArticle(result.article) };
          }
          default: {
            const result = await client.deleteArticle(requireId('delete'), context.signal);
            return { action: 'delete', success: result.success !== false };
          }
        }
      },
    }),

    tool({
      name: 'opentweet_search_inspiration',
      label: 'OpenTweet Search Inspiration',
      description:
        'Search X for high performing posts on a topic, to research angles before writing. Counts against the account daily search quota.',
      parameters: Type.Object({
        query: Type.String({ description: 'Search query, for example "SaaS pricing", "from:naval" or "#startup".' }),
        max_results: Type.Optional(Type.Integer({ minimum: 10, maximum: 100, description: 'Defaults to 20.' })),
        sort_order: Type.Optional(
          Type.Union([Type.Literal('relevancy'), Type.Literal('recency')], {
            description: 'Defaults to relevancy.',
          })
        ),
        lang: Type.Optional(Type.String({ description: 'Two letter language code, for example "en".' })),
        min_likes: Type.Optional(Type.Integer({ minimum: 0 })),
        has_media: Type.Optional(Type.Boolean({ description: 'Only return posts with media.' })),
      }),
      outputSchema: Type.Object(
        {
          result_count: Type.Number(),
          cached: Type.Boolean(),
          searches_remaining: Type.Optional(Type.Number()),
          tweets: Type.Array(
            Type.Object(
              {
                id: Type.String(),
                text: Type.String(),
                author: Type.String(),
                author_followers: Type.Number(),
                likes: Type.Number(),
                retweets: Type.Number(),
                replies: Type.Number(),
                impressions: Type.Number(),
                url: Type.String(),
                created_at: Type.Optional(Type.String()),
              },
              { additionalProperties: false }
            )
          ),
        },
        { additionalProperties: false }
      ),
      async execute(params, config: Config, context) {
        context.signal?.throwIfAborted();
        const client = createClient(config);

        const search = new URLSearchParams({ q: params.query });
        if (params.max_results) search.set('max_results', String(params.max_results));
        if (params.sort_order) search.set('sort_order', params.sort_order);
        if (params.lang) search.set('lang', params.lang);
        if (params.min_likes) search.set('min_likes', String(params.min_likes));
        if (params.has_media) search.set('has_media', 'true');

        const result = (await client.searchInspiration(search.toString(), context.signal)) as {
          data?: InspirationTweet[];
          cached?: boolean;
          usage?: { searches_remaining?: number };
        };

        const tweets = result.data ?? [];

        return {
          result_count: tweets.length,
          cached: Boolean(result.cached),
          searches_remaining: result.usage?.searches_remaining,
          tweets: tweets.map((tweet) => ({
            id: tweet.id,
            text: tweet.text,
            author: `@${tweet.author_username}`,
            author_followers: tweet.author_followers_count ?? 0,
            likes: tweet.public_metrics?.like_count ?? 0,
            retweets: tweet.public_metrics?.retweet_count ?? 0,
            replies: tweet.public_metrics?.reply_count ?? 0,
            impressions: tweet.public_metrics?.impression_count ?? 0,
            url: `https://x.com/i/status/${tweet.id}`,
            created_at: tweet.created_at,
          })),
        };
      },
    }),

    tool({
      name: 'opentweet_repurpose_tweet',
      label: 'OpenTweet Repurpose',
      description:
        'Rewrite an existing post in the account voice and save it as a draft. Pair this with opentweet_search_inspiration. Counts against the account daily AI generation quota.',
      parameters: Type.Object({
        tweet_text: Type.String({ description: 'The original post text to rewrite.' }),
        tweet_author: Type.Optional(Type.String({ description: 'Original author handle, for example "@naval".' })),
        instructions: Type.Optional(Type.String({ description: 'Extra guidance, for example "make it more technical".' })),
        tone: Type.Optional(Type.String({ description: 'Desired tone, for example "casual" or "bold".' })),
        save_as_draft: Type.Optional(Type.Boolean({ description: 'Save the result as a draft. Defaults to true.' })),
        x_account_id: Type.Optional(Type.String()),
      }),
      outputSchema: Type.Object(
        {
          text: Type.String(),
          category: Type.Optional(Type.String()),
          key_topics: Type.Optional(Type.Array(Type.String())),
          draft_id: Type.Optional(Type.String()),
          generations_remaining: Type.Optional(Type.Number()),
        },
        { additionalProperties: false }
      ),
      async execute(params, config: Config, context) {
        context.signal?.throwIfAborted();
        const client = createClient(config);

        const result = (await client.repurposeInspiration(
          {
            tweet_text: params.tweet_text,
            tweet_author: params.tweet_author,
            instructions: params.instructions,
            tone: params.tone,
            save_as_draft: params.save_as_draft ?? true,
            x_account_id: params.x_account_id,
          },
          context.signal
        )) as {
          repurposed?: { text: string; category?: string; key_topics?: string[] };
          draft?: { id: string };
          usage?: { ai_generations_remaining?: number };
        };

        if (!result.repurposed?.text) {
          throw new Error('OpenTweet did not return a repurposed post.');
        }

        return {
          text: result.repurposed.text,
          category: result.repurposed.category,
          key_topics: result.repurposed.key_topics,
          draft_id: result.draft?.id,
          generations_remaining: result.usage?.ai_generations_remaining,
        };
      },
    }),
  ],
});
