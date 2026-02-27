# Multi-Environment Configuration Guide

pgLite now supports multiple database environments with easy switching through the UI.

## Overview

The application supports the following environments:

- **Loadtest Azure** - Load testing environment on Azure
- **Sandbox** - Sandbox testing environment
- **Staging** - Pre-production staging environment
- **VegaPay UAT Snapshot** - VegaPay UAT snapshot database (requires VPN)
- **VegaPay UAT** - VegaPay UAT environment (requires VPN)
- **Unity UAT** - Unity UAT environment (requires VPN)
- **Development (Local)** - Local development environment

## Configuration

### Environment Files

Each environment has its own configuration file in the root directory:

- `.env.loadtest` - Loadtest Azure environment credentials
- `.env.sandbox` - Sandbox environment credentials
- `.env.staging` - Staging environment credentials
- `.env.vegapay-uat-snapshot` - VegaPay UAT snapshot credentials (requires VPN)
- `.env.vegapay-uat` - VegaPay UAT credentials (requires VPN)
- `.env.unity-uat` - Unity UAT credentials (requires VPN)
- `.env.dev` - Local development credentials

### Setting Up Environments

1. **Update credentials in environment files:**

Edit each `.env.*` file with your database credentials:

```env
POSTGRES_HOST=your-server.postgres.database.azure.com
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=postgres
```

2. **Configure in code (alternative):**

You can also update credentials directly in `lib/environments.ts`:

```typescript
export const environments: Record<string, Environment> = {
    alpha: {
        name: "Alpha",
        host: "your-alpha-server.com",
        port: 5432,
        user: "postgres",
        password: "your_password",
        database: "postgres",
    },
    // ... other environments
};
```

## Usage

### Switching Environments in the UI

1. Launch the application
2. Look for the **Environment Selector** dropdown in the top-left sidebar
3. Click the dropdown to see available environments
4. Select your desired environment:
    - **Loadtest Azure** (Cyan) - No VPN required
    - **Sandbox** (Yellow) - No VPN required
    - **Staging** (Orange) - No VPN required
    - **VegaPay UAT Snapshot** (Purple) 🔒 - Requires VPN
    - **VegaPay UAT** (Blue) 🔒 - Requires VPN
    - **Unity UAT** (Indigo) 🔒 - Requires VPN
    - **Development (Local)** (Green) - No VPN required
5. The application will automatically:
    - Reconnect to the selected environment
    - Reload the database list
    - Update the table structure

**Note:** Environments marked with 🔒 require VPN connection to access.

### Environment Indicator

Each environment has a color-coded indicator:

- 🟦 **Loadtest Azure** - Cyan
- 🟨 **Sandbox** - Yellow
- 🟧 **Staging** - Orange
- 🟪 **VegaPay UAT Snapshot** - Purple 🔒 (VPN required)
- 🟦 **VegaPay UAT** - Blue 🔒 (VPN required)
- 🟦 **Unity UAT** - Indigo 🔒 (VPN required)
- 🟢 **Development (Local)** - Green

### Adding New Environments

To add a new environment:

1. Create a new `.env.{name}` file with credentials
2. Add the environment to `lib/environments.ts`:

```typescript
export const environments: Record<string, Environment> = {
    // ... existing environments
    custom: {
        name: "Custom Environment",
        host: "your-custom-server.com",
        port: 5432,
        user: "postgres",
        password: "your_password",
        database: "postgres",
        requiresVPN: false,
    },
};
```

3. Update the `EnvironmentSelector` component to include the new environment:

```typescript
const environments = [
    // ... existing environments
    {
        id: "custom",
        name: "Custom Environment",
        color: "bg-pink-500",
        requiresVPN: false,
    },
];
```

## Architecture

### Connection Pooling

The application uses connection pooling to efficiently manage database connections:

- Each environment maintains its own connection pool
- Pools are cached and reused across requests
- Automatic cleanup when switching environments

### API Routes

All API routes support the `environment` parameter:

- `GET /api/databases?environment={env}` - Get databases for an environment
- `POST /api/query` - Execute query with `{ query, database, environment }`
- `POST /api/columns` - Get columns with `{ database, environment }`

## Security Notes

⚠️ **Important Security Considerations:**

1. **Never commit credentials to git**
    - All `.env.*` files are git-ignored
    - Use environment variables or secure vaults in production

2. **VPN-Protected Environments**
    - VegaPay UAT, VegaPay UAT Snapshot, and Unity UAT require VPN connection
    - Ensure VPN is active before attempting to connect
    - Connection will fail if VPN is not established

3. **Production-Like Environments**
    - Exercise caution when working with UAT and staging environments
    - Consider read-only access for viewing sensitive data
    - Implement audit logging for critical queries

4. **Credential Management**
    - Rotate passwords regularly
    - Use different credentials per environment
    - Implement least-privilege access

## Troubleshooting

### Connection Failed

If you can't connect to an environment:

1. **For VPN-required environments (VegaPay UAT, VegaPay UAT Snapshot, Unity UAT):**
    - Ensure VPN connection is active and established
    - Verify you have access to the VPN network
    - Check VPN configuration and routing
2. Verify credentials in the `.env.{name}` file or `lib/environments.ts`
3. Check network connectivity to the database server
4. Ensure SSL settings match your database requirements
5. Verify firewall rules allow connections

### Environment Not Appearing

If a new environment doesn't show in the dropdown:

1. Check it's added to `lib/environments.ts`
2. Verify it's included in the `EnvironmentSelector` component
3. Clear browser localStorage and refresh

### Data Not Refreshing

If data doesn't update when switching environments:

1. Check browser console for errors
2. Verify API routes are receiving the environment parameter
3. Clear connection pool cache by restarting the application
