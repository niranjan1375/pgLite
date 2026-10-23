import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const dir = mkdtempSync(path.join(tmpdir(), "pglite-schema-cache-"));
process.env.PGLITE_SCHEMA_CACHE_DIR = dir;
const { cachedSchema, mapWithConcurrency, SCHEMA_STALE_AFTER_MS } =
    await import("./schema-cache");

const memory = () =>
    (globalThis as { __pgliteSchemaCache?: { memory: Map<string, unknown> } })
        .__pgliteSchemaCache!.memory;
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

let key = 0;
const nextKey = () => `test:${++key}`;

beforeEach(() => {
    vi.useRealTimers();
});

afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
});

describe("cachedSchema", () => {
    it("loads on a miss and serves the cache afterwards", async () => {
        const k = nextKey();
        const load = vi.fn().mockResolvedValue(["a"]);
        expect((await cachedSchema(k, load)).data).toEqual(["a"]);
        expect((await cachedSchema(k, load)).data).toEqual(["a"]);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("serves a stale entry at once and refreshes it in the background", async () => {
        const k = nextKey();
        await cachedSchema(k, async () => "old");

        vi.useFakeTimers({ toFake: ["Date"] });
        vi.setSystemTime(Date.now() + SCHEMA_STALE_AFTER_MS + 1);
        const load = vi.fn().mockResolvedValue("new");
        const served = await cachedSchema(k, load);
        expect(served).toMatchObject({ data: "old", stale: true });
        expect(load).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
        await settle();
        expect((await cachedSchema(k, load)).data).toBe("new");
    });

    it("force reloads even when cached", async () => {
        const k = nextKey();
        await cachedSchema(k, async () => 1);
        expect((await cachedSchema(k, async () => 2, { force: true })).data).toBe(2);
    });

    it("shares one load between concurrent misses", async () => {
        const k = nextKey();
        const load = vi.fn(async () => {
            await settle();
            return "x";
        });
        await Promise.all([cachedSchema(k, load), cachedSchema(k, load)]);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it("survives a restart via the disk copy", async () => {
        const k = nextKey();
        await cachedSchema(k, async () => ({ tables: 3 }));
        await settle(); // disk write is fire-and-forget
        memory().clear();
        const load = vi.fn().mockResolvedValue({ tables: 0 });
        expect((await cachedSchema(k, load)).data).toEqual({ tables: 3 });
        expect(load).not.toHaveBeenCalled();
        expect(readdirSync(dir).some((f) => f.endsWith(".tmp"))).toBe(false);
    });

    it("does not cache failures", async () => {
        const k = nextKey();
        await expect(
            cachedSchema(k, () => Promise.reject(new Error("vpn down"))),
        ).rejects.toThrow("vpn down");
        expect((await cachedSchema(k, async () => "ok")).data).toBe("ok");
    });
});

describe("mapWithConcurrency", () => {
    it("keeps order and caps parallelism", async () => {
        let running = 0;
        let peak = 0;
        const out = await mapWithConcurrency([5, 1, 4, 2, 3], 2, async (n) => {
            running++;
            peak = Math.max(peak, running);
            await new Promise((resolve) => setTimeout(resolve, n));
            running--;
            return n * 10;
        });
        expect(out).toEqual([50, 10, 40, 20, 30]);
        expect(peak).toBe(2);
    });
});
