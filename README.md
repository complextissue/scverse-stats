# scverse-stats

Automated statistics collection for the scverse organization.

## Setup

1. Copy `.env.example` to `.env` and fill in your credentials:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your credentials:
   - `GITHUB_TOKEN` - GitHub personal access token with repo read access
   - `ZULIP_EMAIL` - Your Zulip account email
   - `ZULIP_API_KEY` - Your Zulip API key
   - `ZULIP_REALM` - Your Zulip realm URL (e.g., https://scverse.zulipchat.com)

3. Set up node

    ```bash
    nvm use
    npm i
    ```

## Structure

```
scverse-stats/
├── collectors/          # Individual data collectors
│   ├── gitHubCollector.ts      # GitHub repos, stars, PRs, issues, contributors
│   ├── zulipCollector.ts       # Zulip active users
│   ├── blueskyCollector.ts     # Bluesky followers
│   ├── ecosystemCollector.ts   # Ecosystem packages
│   └── citationsCollector.ts   # Citation counts
├── types.ts            # Zod schemas for validation
├── utils.ts            # Common utilities (saveJson, loadJson, sleep)
├── combiner.ts         # Combines all JSON files into stats.json
└── index.ts            # Main orchestrator (runs all collectors + combiner)
```

## Usage

```bash
# Development (uses tsx, reads from .env)
npm run dev

# Production (build and run)
npm run build
npm start
```

## Output

All data is saved to `output/` directory:

- `github.json` - GitHub statistics
- `zulip.json` - Zulip statistics
- `bluesky.json` - Bluesky statistics
- `ecosystem.json` - Ecosystem packages
- `citations.json` - Citation counts
- `contributors.json` - All unique contributors with name, GitHub handle, avatar URL, and contribution count
- `stats.json` - Combined statistics (final output)

## How it works

1. All collectors run in parallel using `Promise.all()`
2. Each collector validates data with Zod schemas (drops unknown fields)
3. Collectors save individual JSON files to `output/`
4. Combiner reads all files and creates combined `stats.json`

## Configuration

Edit `config/config.yaml` to change which GitHub repositories to track.

## GitHub Actions / CI Deployment

When deploying via GitHub Actions, set the following secrets in your repository:

- `GITHUB_TOKEN` - Automatically provided by GitHub Actions, or use a custom PAT
- `ZULIP_EMAIL` - Zulip account email
- `ZULIP_API_KEY` - Zulip API key
- `ZULIP_REALM` - Zulip realm URL

These will be automatically used instead of the `.env` file when running in CI.
