// Sticky "Star · <count>" pill in the entry top bar.
//
// Mirrors the marketing landing-page header (`apps/landing-page`):
// fetches `/repos/nexu-io/open-design` once on mount, formats the
// count, and renders a small CTA that opens the GitHub repo in a new
// tab. The result is cached at module scope so navigating between
// entry sub-views doesn't trigger a fresh API call, and the request
// is wrapped in a try/catch so an offline / rate-limited fetch never
// breaks the topbar layout — the pill simply falls back to "Star".

import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { useT } from '../i18n';

const REPO = 'https://github.com/nexu-io/open-design';
const API = 'https://api.github.com/repos/nexu-io/open-design';
const LS_KEY = 'open-design:gh-stars';
// One-hour soft cache — long enough to dodge GitHub's 60/hr
// unauthenticated quota when the same user reopens the app several
// times in a session, short enough that growing star counts still
// surface within a single working day.
const CACHE_TTL_MS = 60 * 60 * 1000;

type CachedStars = { count: number; ts: number };

let memoryCache: CachedStars | null = null;

function readPersistedCache(): CachedStars | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedStars>;
    if (
      typeof parsed.count !== 'number' ||
      typeof parsed.ts !== 'number'
    )
      return null;
    return { count: parsed.count, ts: parsed.ts };
  } catch {
    return null;
  }
}

function writePersistedCache(value: CachedStars): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(value));
  } catch {
    // Quota errors are fine to swallow — the in-memory cache still
    // keeps subsequent renders cheap within this tab.
  }
}

function formatStars(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count < 1000) return String(count);
  return `${(count / 1000).toFixed(1).replace(/\.0$/, '')}K`;
}

export function GithubStarBadge() {
  const t = useT();
  const [count, setCount] = useState<number | null>(() => {
    if (memoryCache) return memoryCache.count;
    const persisted = readPersistedCache();
    if (persisted) memoryCache = persisted;
    return persisted ? persisted.count : null;
  });

  useEffect(() => {
    const now = Date.now();
    const cached = memoryCache ?? readPersistedCache();
    if (cached && now - cached.ts < CACHE_TTL_MS) {
      memoryCache = cached;
      setCount(cached.count);
      return;
    }
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(API, {
          headers: { Accept: 'application/vnd.github+json' },
          signal: ctrl.signal,
        });
        if (!res.ok) return;
        const data = (await res.json()) as { stargazers_count?: unknown };
        if (typeof data.stargazers_count !== 'number') return;
        const next: CachedStars = {
          count: data.stargazers_count,
          ts: Date.now(),
        };
        memoryCache = next;
        writePersistedCache(next);
        setCount(next.count);
      } catch {
        // Network failures and rate-limit 403s both land here. The
        // pill keeps rendering its previous (or fallback) count.
      }
    })();
    return () => ctrl.abort();
  }, []);

  return (
    <a
      className="entry-star-badge"
      href={REPO}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={t('entry.githubStarAria')}
      title={t('entry.githubStarTitle')}
      data-testid="entry-star-badge"
    >
      <Icon name="github" size={13} className="entry-star-badge__icon" />
      <span className="entry-star-badge__label">{t('entry.githubStarLabel')}</span>
      <span className="entry-star-badge__sep" aria-hidden>
        ·
      </span>
      <span className="entry-star-badge__count" data-loading={count === null}>
        {count === null ? '—' : formatStars(count)}
      </span>
    </a>
  );
}
