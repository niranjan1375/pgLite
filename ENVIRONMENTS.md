# Environment Configuration Summary

## Available Environments

All database environments have been configured from the details in `dbDetails.txt`:

### ✅ No VPN Required

1. **Loadtest Azure** (Default)
    - Host: vegapay-loadtest-postgres-server.postgres.database.azure.com
    - Database: support
    - Color: Cyan 🟦
    - File: `.env.loadtest`

2. **Sandbox**
    - Host: vegapay-sandbox-postgres-server.postgres.database.azure.com
    - Database: postgres
    - Color: Yellow 🟨
    - File: `.env.sandbox`

3. **Staging**
    - Host: vegapay-staging-postgres-server.postgres.database.azure.com
    - Database: postgres
    - Color: Orange 🟧
    - File: `.env.staging`

4. **Development (Local)**
    - Host: localhost
    - Database: postgres
    - Color: Green 🟢
    - File: `.env.dev`

### 🔒 VPN Required

5. **VegaPay UAT Snapshot**
    - Host: rds-ssfb-prod-dec-08-2025.cr6ssimwi9q4.ap-south-1.rds.amazonaws.com
    - Database: card_processor
    - Color: Purple 🟪
    - File: `.env.vegapay-uat-snapshot`

6. **VegaPay UAT**
    - Host: vegapay-rds.cr6ssimwi9q4.ap-south-1.rds.amazonaws.com
    - Database: card_processor
    - Color: Blue 🟦
    - File: `.env.vegapay-uat`

7. **Unity UAT**
    - Host: vegapay-unity-prod-db.cdkwy8wyw3a2.ap-south-1.rds.amazonaws.com
    - Database: card_processor
    - Color: Indigo 🟦
    - File: `.env.unity-uat`

## Quick Start

1. **Launch the app:**

    ```bash
    npm run dev
    ```

2. **Select environment:**
    - Look for the environment selector dropdown in the top-left sidebar
    - Click to see all available environments
    - Environments requiring VPN are marked with 🔒
    - Select your desired environment

3. **For VPN-required environments:**
    - Connect to VPN first
    - Then select the environment in the UI
    - The app will connect once VPN is active

## Configuration Files

All credentials are stored in two places:

1. **Code configuration:** `lib/environments.ts` (currently active)
2. **Environment files:** Individual `.env.{name}` files

You can modify either location. The code configuration is currently being used.

## Notes

- All credentials from `dbDetails.txt` have been populated
- VPN handling is on your side (as mentioned)
- Default environment is **Loadtest Azure**
- Environment selection persists in browser localStorage
- Connections are pooled per environment for performance
