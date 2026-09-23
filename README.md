# OpenTweet plugin for OpenClaw

Schedule and publish X, Bluesky and LinkedIn posts, threads and long-form articles from OpenClaw, using your [OpenTweet](https://opentweet.io) account.

## Install

```bash
openclaw plugins install clawhub:@opentweetio/openclaw-plugin
openclaw plugins enable opentweet
openclaw gateway restart
```

## Configure

Create an API key at [opentweet.io/developer](https://opentweet.io/developer), then add it to `openclaw.json`:

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
| `opentweet_list_platforms` | Connected networks, the auto cross-post setting, and what an unspecified post targets |
| `opentweet_post` | Create a post or thread on X, Bluesky, LinkedIn or any combination: draft, schedule, or publish now |
| `opentweet_list_posts` | List drafts, scheduled, published or failed posts |
| `opentweet_update_post` | Edit, reschedule, publish or delete an existing post |
| `opentweet_upload_media` | Upload an image or video and get a media URL |
| `opentweet_analytics` | Publishing overview, top posts, best times to post |
| `opentweet_article` | Create, update, publish or delete long-form X articles |
| `opentweet_search_inspiration` | Search X for high performing posts on a topic |
| `opentweet_repurpose_tweet` | Rewrite a post in your voice and save it as a draft |

Multi-account users should call `opentweet_accounts` first and pass the resulting `x_account_id` to the other tools.

### Cross-posting

`opentweet_post` takes a `platforms` array. Pass `["x", "bluesky", "linkedin"]` to publish the same content to all three networks in one call, or any subset such as `["bluesky"]` for Bluesky only or `["x", "linkedin"]`. An explicit list is always honoured exactly.

Leaving `platforms` out is not the same as pinning the post to X. An unspecified post follows the account's auto cross-post setting, which sends it to every connected network when that setting is on. Call `opentweet_list_platforms` to see what an unspecified post would target.

`opentweet_list_platforms` reports `default_targets` (what an unspecified post is attempted on) and `deliverable_targets` (the subset that will actually land) separately, and likewise `connected` and `usable`. A network whose authorisation has expired is still `connected` but has `usable: false` and `needs_reconnect: true`, and cannot publish until it is reconnected.

Every post comes back with a `results` array carrying one entry per network: `published` with a `url`, `failed` with an `error`, or `skipped` with a `skip_reason`. A skip is not a failure, so read the array before reporting the outcome.

## Notes

- `opentweet_search_inspiration` and `opentweet_repurpose_tweet` consume the daily search and AI generation quotas on your OpenTweet plan.
- Publishing an article to X requires an X Premium subscription on the connected account.
- Bluesky caps posts at 300 characters. Text that fits X can come back as a `failed` Bluesky entry while X publishes fine.
- LinkedIn posts go to your personal profile only (no Company Pages) and allow 3,000 characters, where an emoji counts as 2. A thread goes to LinkedIn as one post with the parts joined by a blank line. Video is not supported, so a post with video comes back as a `skipped` LinkedIn entry with a `skip_reason`. Hashtags and mentions publish as plain text, and there are no LinkedIn analytics.
- Connect LinkedIn in the OpenTweet dashboard under Settings > Accounts > Connect LinkedIn. The sign-in lasts 60 days, then needs a one-click reconnect. Until then `opentweet_list_platforms` shows LinkedIn as `usable: false` with `needs_reconnect: true`.

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
