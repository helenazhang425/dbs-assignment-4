# WikiWatch Architecture

## Project Summary

WikiWatch is a live Wikipedia watchlist application.

Users choose Wikipedia pages they want to monitor. A background worker polls the Wikipedia RecentChanges API on a fixed interval, filters for edits to watched pages, writes new edits into Supabase, and the Next.js frontend receives live updates through Supabase Realtime.

Architecture pattern:

External Data Source -> Background Worker (Railway) -> Database (Supabase + Realtime) -> Frontend (Next.js on Vercel)

## Core User Story

A user adds one or more Wikipedia page titles to a personal watchlist.

The app then:

- checks Wikipedia for new edits
- stores matching edits in Supabase
- shows those edits on the frontend without a page refresh

## External Data Source

Primary source:

- MediaWiki RecentChanges API
- Docs: https://www.mediawiki.org/wiki/API:RecentChanges
- Endpoint base: `https://en.wikipedia.org/w/api.php`

Why this source:

- free
- public
- updates continuously
- works well with polling
- includes edit metadata needed for the UI

Relevant fields we can request:

- `title`
- `timestamp`
- `user`
- `comment`
- `type`
- revision IDs
- page IDs
- size / byte change
- bot flags

Suggested request shape:

`action=query&list=recentchanges&rcprop=title|ids|user|comment|timestamp|flags|sizes&rclimit=100&format=json`

## Polling Model

Polling means the Railway worker asks Wikipedia for new data on a schedule.

Suggested interval:

- every 60 seconds for MVP

Important note from MediaWiki docs:

- recent changes can appear slightly out of order
- the worker should query with a small overlap window and dedupe before insert

Recommended strategy:

- run every 60 seconds
- request changes from the last 2 to 3 minutes
- dedupe using a unique external identifier such as `rcid` or `revid`

## Product Scope

This should be scoped as a personal watchlist, not a full Wikipedia tracker.

MVP scope:

- single-user app or demo-user app
- user can add page titles to a watchlist
- worker polls for edits
- only edits to watched pages are stored
- frontend shows a live feed of matching edits

Non-MVP items that can wait:

- auth
- fuzzy search across all Wikipedia pages
- notifications
- multiple users with isolated watchlists
- analytics dashboards beyond a simple summary

## System Components

### 1. Next.js Frontend on Vercel

Responsibilities:

- show saved watchlist pages
- allow adding and removing watched pages
- render recent edits feed
- subscribe to Supabase Realtime for new edits

Suggested pages/components:

- home page with watchlist + live feed
- add-page form
- watchlist table
- recent edits feed
- small stats section: edits today, most active watched page

### 2. Railway Background Worker

Responsibilities:

- run on a fixed interval
- fetch recent changes from Wikipedia
- load watched pages from Supabase
- filter edits to watched titles
- insert unseen edits into Supabase

Worker loop:

1. fetch current watched page titles from Supabase
2. request recent changes from Wikipedia
3. normalize titles
4. keep only edits where `title` matches a watched page
5. skip rows already stored
6. insert new edits into `wiki_edits`
7. update poll metadata

### 3. Supabase Database

Responsibilities:

- store watched pages
- store incoming edits
- provide realtime subscriptions to the frontend

### 4. Supabase Realtime

Responsibilities:

- emit insert events when new edit rows are added
- let the frontend update live without refresh

## Database Schema

### Table: `watched_pages`

Purpose:

- stores the list of Wikipedia page titles the app should monitor

Suggested columns:

- `id` uuid primary key
- `title` text unique not null
- `created_at` timestamptz default now()

Notes:

- for MVP, keep titles unique globally
- if auth is added later, attach rows to a `user_id`

### Table: `wiki_edits`

Purpose:

- stores matching recent changes returned from Wikipedia

Suggested columns:

- `id` uuid primary key
- `rcid` bigint unique not null
- `page_id` bigint
- `title` text not null
- `change_type` text
- `user_name` text
- `comment` text
- `timestamp` timestamptz not null
- `old_rev_id` bigint
- `new_rev_id` bigint
- `old_len` integer
- `new_len` integer
- `byte_diff` integer
- `is_bot` boolean default false
- `created_at` timestamptz default now()

Recommended indexes:

- index on `title`
- index on `timestamp desc`
- unique index on `rcid`

### Optional Table: `worker_state`

Purpose:

- tracks metadata for the poller

Suggested columns:

- `key` text primary key
- `value` jsonb
- `updated_at` timestamptz default now()

Possible stored values:

- last successful poll timestamp
- last API cursor or overlap window

This table is optional because deduping by `rcid` already gives strong protection against duplicates.

## Data Flow

1. User adds `Taylor Swift` or `2026 FIFA World Cup` to `watched_pages`.
2. Railway worker runs every 60 seconds.
3. Worker fetches recent changes from Wikipedia.
4. Worker filters to rows where `title` matches a watched page.
5. Worker inserts unseen rows into `wiki_edits`.
6. Supabase Realtime emits insert events.
7. Next.js frontend receives the new rows and updates the feed instantly.

## Realtime UX

The external source is not pushing directly to the browser.

The system feels live because:

- Railway polls Wikipedia
- Railway inserts rows into Supabase
- Supabase Realtime pushes those inserts to the frontend

So the chain is:

Wikipedia poll -> Supabase insert -> frontend live update

## Matching Strategy

For MVP, use exact title matching only.

Example:

- watched title: `Taylor Swift`
- incoming edit title: `Taylor Swift`
- match succeeds

Avoid for MVP:

- keyword matching
- category crawling
- fuzzy matching
- recursive link discovery

Exact title matching keeps the worker deterministic and easy to debug.

## Search / Add Page UX

Simplest MVP:

- user types exact Wikipedia page title into a form
- app inserts that string into `watched_pages`

Better version after MVP:

- use the Wikipedia search API to help users find valid page titles before adding them

## Failure Handling

Worker should handle:

- Wikipedia API timeout or error
- empty watchlist
- duplicate inserts
- malformed rows

Recommended behavior:

- log errors
- continue next poll cycle
- rely on unique `rcid` constraint to avoid duplicate rows

## Deployment

### Vercel

- hosts the Next.js frontend

### Railway

- runs the scheduled background worker

### Supabase

- stores app data
- provides Realtime subscriptions

## MVP Build Order

1. Create Supabase tables.
2. Build a simple Next.js page that lists watched pages and recent edits.
3. Add a form to insert watched page titles.
4. Build the Railway worker to poll Wikipedia and insert matching edits.
5. Enable Supabase Realtime on `wiki_edits`.
6. Subscribe on the frontend and append new edits live.

## Presentation Framing

Recommended class framing:

WikiWatch is a live personal watchlist for Wikipedia pages. It monitors changes to pages the user cares about and shows those edits in real time using a polling worker, Supabase storage, and frontend realtime subscriptions.

## Open Decisions

These are the main decisions to finalize together:

- single-user only or add auth
- exact title entry only or search-assisted add flow
- 60-second poll interval or 30-second interval
- minimalist UI or newsroom-style live feed
- whether to keep all historical edits or prune old rows

## Sources

- MediaWiki RecentChanges API: https://www.mediawiki.org/wiki/API:RecentChanges
- MediaWiki recent changes stream overview: https://www.mediawiki.org/wiki/API:Recent_changes_stream
