import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const envFiles = fs
    .readdirSync(root)
    .filter(
        (file) =>
            file.startsWith(".env") &&
            fs.statSync(path.join(root, file)).isFile(),
    );

function parseEnvFile(filePath) {
    const parsed = {};
    const content = fs.readFileSync(filePath, "utf8");

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }

        const index = line.indexOf("=");
        if (index === -1) {
            continue;
        }

        const key = line.slice(0, index).trim();
        let value = line.slice(index + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        parsed[key] = value;
    }

    return parsed;
}

function normalizeId(id) {
    return id.toLowerCase().replace(/_/g, "-");
}

function formatName(id) {
    return id
        .split(/[-_]/g)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function inferRequiresVPN(id) {
    return /(uat|prod)/i.test(id);
}

const environments = new Map();

if (envFiles.includes(".env.local")) {
    const envLocal = parseEnvFile(path.join(root, ".env.local"));
    const prefixes = new Set();

    for (const key of Object.keys(envLocal)) {
        const match = key.match(/^([A-Z0-9_]+)_(HOST|PORT|USER|PASSWORD|DB)$/);
        if (match) {
            prefixes.add(match[1]);
        }
    }

    for (const prefix of prefixes) {
        const id = normalizeId(prefix);
        environments.set(id, {
            id,
            name: formatName(id),
            host: envLocal[`${prefix}_HOST`] || "",
            port: Number(envLocal[`${prefix}_PORT`] || "5432"),
            user: envLocal[`${prefix}_USER`] || "",
            password: envLocal[`${prefix}_PASSWORD`] || "",
            database: envLocal[`${prefix}_DB`] || "",
            requiresVPN: inferRequiresVPN(id),
        });
    }
}

for (const file of envFiles) {
    if (file === ".env.local" || file === ".env.local.example") {
        continue;
    }

    const id =
        file === ".env" ? "default" : normalizeId(file.replace(/^\.env\./, ""));

    const parsed = parseEnvFile(path.join(root, file));

    const hasPostgresShape =
        parsed.POSTGRES_HOST ||
        parsed.POSTGRES_PORT ||
        parsed.POSTGRES_USER ||
        parsed.POSTGRES_PASSWORD ||
        parsed.POSTGRES_DB;

    if (!hasPostgresShape) {
        continue;
    }

    environments.set(id, {
        id,
        name: formatName(id),
        host: parsed.POSTGRES_HOST || "",
        port: Number(parsed.POSTGRES_PORT || "5432"),
        user: parsed.POSTGRES_USER || "",
        password: parsed.POSTGRES_PASSWORD || "",
        database: parsed.POSTGRES_DB || "",
        requiresVPN: inferRequiresVPN(id),
    });
}

const merged = Array.from(environments.values())
    .filter((entry) => entry.host && entry.user && entry.database)
    .sort((a, b) => a.id.localeCompare(b.id));

const targetPath = path.join(root, ".pgconsole", "credentials.json");
fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(
    targetPath,
    `${JSON.stringify({ environments: merged }, null, 2)}\n`,
    "utf8",
);

console.log(
    `Updated .pgconsole/credentials.json with ${merged.length} environments.`,
);
