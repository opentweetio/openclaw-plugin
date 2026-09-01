# OpenTweet plugin for OpenClaw

Schedule and publish X posts, threads and long-form articles from OpenClaw, using your [OpenTweet](https://opentweet.io) account.

## Install

```bash
openclaw plugins install clawhub:@opentweetio/openclaw-plugin
openclaw plugins enable opentweet
openclaw gateway restart
```

## Configure

Create an API key at [opentweet.io/dashboard/api-keys](https://opentweet.io/dashboard/api-keys), then add it to `openclaw.json`:

```json5
{
  plugins: {
    entries: {
      opentweet: {
        enabled: true,
        config: { apiKey: "ot_..." }
      }
    }
  }
}
```

`baseUrl` is optional and only needed for self-hosted OpenTweet instances.

## Tools

| Tool | What it does |
| --- | --- |
| `opentweet_accounts` | Connected X accounts, subscription status, remaining daily quota |
| `opentweet_post` | Create a post or thread: draft, schedule, or publish now |
| `opentweet_list_posts` | List drafts, scheduled, published or failed posts |
| `opentweet_update_post` | Edit, reschedule, publish or delete an existing post |
| `opentweet_upload_media` | Upload an image or video and get a media URL |
| `opentweet_analytics` | Publishing overview, top posts, best times to post |
| `opentweet_article` | Create, update, publish or delete long-form X articles |
| `opentweet_search_inspiration` | Search X for high performing posts on a topic |
| `opentweet_repurpose_tweet` | Rewrite a post in your voice and save it as a draft |

Multi-account users should call `opentweet_accounts` first and pass the resulting `x_account_id` to the other tools.

## Notes

- `opentweet_search_inspiration` and `opentweet_repurpose_tweet` consume the daily search and AI generation quotas on your OpenTweet plan.
- Publishing an article to X requires an X Premium subscription on the connected account.

## Develop

Requires Node 22.22.3+, 24.15+, or 25.9+, matching OpenClaw's own engine range.

```bash
npm install
npm run build
npm run manifest        # regenerate openclaw.plugin.json from the entry point
npm run validate

npm pack --pack-destination /tmp
openclaw plugins install npm-pack:/tmp/opentweetio-openclaw-plugin-0.1.0.tgz --force
openclaw plugins inspect opentweet --runtime --json
```

## Publish

```bash
clawhub package publish . --dry-run
clawhub package publish .
```

## License

MIT
