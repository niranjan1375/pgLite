import path from "node:path";
import { describe, expect, it } from "vitest";
import { sslOptions, withTlsHint } from "./tls";

const noFile = () => {
    throw new Error("ENOENT");
};

describe("sslOptions", () => {
    it("verifies remote hosts by default", () => {
        expect(sslOptions("staging", { host: "db.example.com" }, noFile)).toEqual(
            { rejectUnauthorized: true },
        );
    });

    it("disables TLS for localhost by default", () => {
        expect(sslOptions("dev", { host: "localhost" }, noFile)).toBe(false);
        expect(sslOptions("dev", { host: "127.0.0.1" }, noFile)).toBe(false);
    });

    it("honours an explicit mode", () => {
        expect(
            sslOptions("x", { host: "db.example.com", ssl: "require" }, noFile),
        ).toEqual({ rejectUnauthorized: false });
        expect(
            sslOptions("x", { host: "db.example.com", ssl: "disable" }, noFile),
        ).toBe(false);
        expect(
            sslOptions("x", { host: "localhost", ssl: "verify" }, noFile),
        ).toEqual({ rejectUnauthorized: true });
    });

    it("loads the CA bundle relative to the working directory", () => {
        const read: string[] = [];
        const options = sslOptions(
            "uat",
            { host: "db.example.com", sslCa: ".pgconsole/rds.pem" },
            (filePath) => {
                read.push(filePath);
                return "PEM";
            },
        );
        expect(options).toEqual({ rejectUnauthorized: true, ca: "PEM" });
        expect(read).toEqual([path.resolve(".pgconsole/rds.pem")]);
    });

    it("ignores sslCa when not verifying", () => {
        expect(
            sslOptions(
                "x",
                { host: "db.example.com", ssl: "require", sslCa: "missing.pem" },
                noFile,
            ),
        ).toEqual({ rejectUnauthorized: false });
    });

    it("fails clearly when the CA bundle is unreadable", () => {
        expect(() =>
            sslOptions(
                "uat",
                { host: "db.example.com", sslCa: "missing.pem" },
                noFile,
            ),
        ).toThrow(/Environment "uat": cannot read sslCa .*missing\.pem \(ENOENT\)/);
    });
});

describe("withTlsHint", () => {
    const tlsError = (code: string) =>
        Object.assign(new Error("self-signed certificate in certificate chain"), {
            code,
        });

    it("explains certificate verification failures", () => {
        const error = withTlsHint(tlsError("SELF_SIGNED_CERT_IN_CHAIN")) as Error;
        expect(error.message).toMatch(/^self-signed certificate in certificate chain — /);
        expect(error.message).toContain('"sslCa"');
        expect(error.message).toContain('"ssl": "require"');
    });

    it("leaves other errors untouched", () => {
        const error = tlsError("ECONNREFUSED");
        withTlsHint(error);
        expect(error.message).toBe("self-signed certificate in certificate chain");
        expect(withTlsHint("boom")).toBe("boom");
        expect(withTlsHint(null)).toBe(null);
    });
});
