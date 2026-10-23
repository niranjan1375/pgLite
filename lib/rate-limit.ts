import { NextRequest, NextResponse } from "next/server";

/**
 * Lightweight in-memory, per-process fixed-window rate limiter.
 *
 * pgLite runs as a single Node process, so a module-level Map is sufficient.
 * This is NOT shared across instances — if pgLite is ever horizontally scaled,
 * swap this for a shared store (Redis, etc.). The limiter is a coarse abuse
 * guard; the real backpressure comes from statement_timeout + the per-request
 * connection pool cap.
 */

interface Bucket {
    count: number;
    resetAt: number;
}

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

// Defaults are generous for a human at a SQL console (a person rarely exceeds
// ~1 explicit query/second) while still capping a scripted flood.
const DEFAULT_WINDOW_MS = parseInt(
    process.env.PGLITE_RATE_WINDOW_MS || "60000",
    10,
);
const DEFAULT_QUERY_LIMIT = parseInt(
    process.env.PGLITE_QUERY_RATE_LIMIT || "60",
    10,
);

function getClientKey(req: NextRequest): string {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip =
        forwarded?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "local";
    return ip;
}

/** Evict expired buckets when the map grows too large (bounded memory). */
function pruneIfNeeded(now: number): void {
    if (buckets.size <= MAX_BUCKETS) {
        return;
    }
    for (const [key, bucket] of buckets) {
        if (now >= bucket.resetAt) {
            buckets.delete(key);
        }
    }
}

export interface RateLimitOptions {
    /** Namespaces the budget so e.g. "query" and "metadata" don't share it. */
    scope: string;
    limit?: number;
    windowMs?: number;
}

/**
 * Enforce a rate limit for this request. Returns a ready-to-send 429 response
 * when the caller is over budget, or null when the request may proceed.
 */
export function rateLimit(
    req: NextRequest,
    options: RateLimitOptions,
): NextResponse | null {
    const limit = options.limit ?? DEFAULT_QUERY_LIMIT;
    const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;

    // A non-positive limit disables throttling for this scope.
    if (!Number.isFinite(limit) || limit <= 0) {
        return null;
    }

    const now = Date.now();
    const key = `${options.scope}:${getClientKey(req)}`;
    const existing = buckets.get(key);

    let count: number;
    let resetAt: number;

    if (!existing || now >= existing.resetAt) {
        resetAt = now + windowMs;
        count = 1;
        buckets.set(key, { count, resetAt });
        pruneIfNeeded(now);
    } else {
        existing.count += 1;
        count = existing.count;
        resetAt = existing.resetAt;
    }

    const remaining = Math.max(0, limit - count);
    const headers: Record<string, string> = {
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(Math.ceil(resetAt / 1000)),
    };

    if (count <= limit) {
        return null;
    }

    const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
    console.warn(
        `Rate limit exceeded for ${key}: ${count}/${limit} in ${windowMs}ms window`,
    );

    return NextResponse.json(
        {
            error: `Rate limit exceeded. Try again in ${retryAfterSeconds}s.`,
        },
        {
            status: 429,
            headers: {
                ...headers,
                "Retry-After": String(retryAfterSeconds),
            },
        },
    );
}
