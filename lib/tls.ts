import path from "node:path";
import type { ConnectionOptions } from "node:tls";

/**
 * - `verify`  — TLS, server certificate and hostname checked (default for
 *   remote hosts). Node's trust store covers public CAs such as Azure's; set
 *   `sslCa` for private CAs such as AWS RDS.
 * - `require` — TLS without certificate checks (encrypted, but open to MITM).
 * - `disable` — no TLS (default for localhost).
 */
export type SslMode = "verify" | "require" | "disable";

export const SSL_MODES: readonly SslMode[] = ["verify", "require", "disable"];

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export interface TlsSettings {
    host: string;
    ssl?: SslMode;
    /** Path to a PEM CA bundle, relative to the working directory. */
    sslCa?: string;
}

export function resolveSslMode(env: TlsSettings): SslMode {
    return env.ssl ?? (LOCAL_HOSTS.has(env.host) ? "disable" : "verify");
}

/** `ssl` option for node-postgres. Throws if the CA bundle can't be read. */
export function sslOptions(
    environment: string,
    env: TlsSettings,
    readFile: (filePath: string) => string,
): false | ConnectionOptions {
    const mode = resolveSslMode(env);
    if (mode === "disable") {
        return false;
    }
    if (mode === "require") {
        return { rejectUnauthorized: false };
    }
    if (!env.sslCa) {
        return { rejectUnauthorized: true };
    }

    const caPath = path.resolve(env.sslCa);
    try {
        return { rejectUnauthorized: true, ca: readFile(caPath) };
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Environment "${environment}": cannot read sslCa ${caPath} (${reason}).`,
        );
    }
}

const CERT_VERIFY_CODES = new Set([
    "SELF_SIGNED_CERT_IN_CHAIN",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "UNABLE_TO_GET_ISSUER_CERT",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "CERT_HAS_EXPIRED",
    "CERT_UNTRUSTED",
    "ERR_TLS_CERT_ALTNAME_INVALID",
]);

/** Appends how-to-fix guidance to certificate verification failures. */
export function withTlsHint(error: unknown): unknown {
    const code = (error as { code?: unknown } | null)?.code;
    if (
        error instanceof Error &&
        typeof code === "string" &&
        CERT_VERIFY_CODES.has(code)
    ) {
        error.message +=
            ` — the database's TLS certificate could not be verified.` +
            ` Set "sslCa" for this environment to its CA bundle` +
            ` (AWS RDS: https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem),` +
            ` or "ssl": "require" to encrypt without verifying.`;
    }
    return error;
}
