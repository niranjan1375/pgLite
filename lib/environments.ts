export interface Environment {
    name: string;
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    requiresVPN?: boolean;
}

export const environments: Record<string, Environment> = {
    loadtest: {
        name: "Loadtest Azure",
        host: "vegapay-loadtest-postgres-server.postgres.database.azure.com",
        port: 5432,
        user: "postgres",
        password: "VeRdsGa*0*1",
        database: "support",
        requiresVPN: false,
    },
    sandbox: {
        name: "Sandbox",
        host: "vegapay-sandbox-postgres-server.postgres.database.azure.com",
        port: 5432,
        user: "postgres",
        password: "dasdfs213#323wq",
        database: "postgres",
        requiresVPN: false,
    },
    staging: {
        name: "Staging",
        host: "vegapay-staging-postgres-server.postgres.database.azure.com",
        port: 5432,
        user: "postgres",
        password: "VeRdsGa*0*1",
        database: "postgres",
        requiresVPN: false,
    },
    "vegapay-uat-snapshot": {
        name: "VegaPay UAT Snapshot",
        host: "rds-ssfb-prod-dec-08-2025.cr6ssimwi9q4.ap-south-1.rds.amazonaws.com",
        port: 5432,
        user: "postgres",
        password: "vboPxcNmBpPn",
        database: "card_processor",
        requiresVPN: true,
    },
    "vegapay-uat": {
        name: "VegaPay UAT",
        host: "vegapay-rds.cr6ssimwi9q4.ap-south-1.rds.amazonaws.com",
        port: 5432,
        user: "postgres",
        password: "VeRdsGa*0*1",
        database: "card_processor",
        requiresVPN: true,
    },
    "unity-uat": {
        name: "Unity UAT",
        host: "vegapay-unity-prod-db.cdkwy8wyw3a2.ap-south-1.rds.amazonaws.com",
        port: 5432,
        user: "postgres",
        password: "VeRdsGa*0*1",
        database: "card_processor",
        requiresVPN: true,
    },
    dev: {
        name: "Development (Local)",
        host: "localhost",
        port: 5432,
        user: "postgres",
        password: "your_dev_password",
        database: "postgres",
        requiresVPN: false,
    },
};

export function getEnvironment(env: string): Environment | null {
    return environments[env] || null;
}

export function getAllEnvironments(): string[] {
    return Object.keys(environments);
}
