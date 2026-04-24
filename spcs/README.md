# Snowpark Container Services (SPCS) Deploy Guide

If you'd like to deploy this app to Snowpark Container Services in your account, follow the instructions outlined below.

## Prerequisites

- App must be working locally as per [README.md](../README.md)
- Docker installed
- Snow CLI configured to connect to your account
    - Or, you may also execute the .sql files in Snowsight

    **NOTE**: If you're using Snow CLI, remember to replace `your-snowcli-connection-name` in commands below with your connection name.

## Steps

### Step 1: Setup Snowflake

From the repo root, run:

```bash
snow sql -c your-snowcli-connection-name -f spcs/spcs-setup.sql
```

> **NOTE**: If the multi-statement file doesn't work with your Snow CLI version, run the statements individually in Snowsight instead.

**IMPORTANT**: Save/copy the image repository URL from the output. You'll need it in Step 2.

### Step 2: Build & Push Docker Image

```bash
# Set your repo URL from Step 1
export REPO_URL="<your-image-repository-url>"
```

```bash
# Build project
npm run build
```

```bash
# Build Docker image
docker build --platform linux/amd64 -t pipeline-auditor:latest -f Dockerfile .
```

```bash
# Tag Docker image
docker tag pipeline-auditor:latest ${REPO_URL}/pipeline-auditor:latest
```

```bash
# Docker login (use Snow CLI)
snow spcs image-registry login -c your-snowcli-connection-name
```

```bash
# Push Docker image to Snowflake
docker push ${REPO_URL}/pipeline-auditor:latest
```

### Step 3: Configure SPCS Service Spec

* Make a copy of `spcs/spcs-spec.yaml.example` and name it `spcs/spcs-spec.yaml`
* Edit `spcs/spcs-spec.yaml` and fill in your values:

    ```yaml
    # Your image URL from Step 1
    image: <your-repo-url>/pipeline-auditor:latest

    # Your Snowflake account details
    SNOWFLAKE_ACCOUNT: "<your-account-identifier>"
    SNOWFLAKE_HOST: "<your-account>.snowflakecomputing.com"
    SNOWFLAKE_WAREHOUSE: "<your-warehouse>"
    SNOWFLAKE_DATABASE: "<your-database>"
    SNOWFLAKE_PAT_ROLE: "<your-role>"
    AUDITOR_SCHEMA: "PIPELINE_AUDITOR_DB.AUDITOR"

    # Your PAT secret (created in spcs-setup.sql)
    snowflakeSecret: AUDITOR_SPCS.APPS.AUDITOR_PAT_SECRET
    ```

### Step 4: Upload SPCS Service Spec

```bash
snow stage copy spcs/spcs-spec.yaml @AUDITOR_SPCS.APPS.SPECS --overwrite -c your-snowcli-connection-name
```

### Step 5: Create SPCS Service

```bash
snow sql -c your-snowcli-connection-name -f spcs/spcs-create-service.sql
```

### Step 6: Get Your App URL

```bash
snow sql -c your-snowcli-connection-name -q "USE AUDITOR_SPCS.APPS; SHOW ENDPOINTS IN SERVICE PIPELINE_AUDITOR_SERVICE;"
```

Look for and copy `ingress_url` — that's your app!

### Step 7: Launch Application

Open `ingress_url` (from Step 6) in a browser window to login and access the app. It should look and behave exactly like it does when you run it locally.

## Future Code Edits

```bash
# Rebuild project
npm run build
```

```bash
# Rebuild Docker image
docker build --platform linux/amd64 -t pipeline-auditor:latest -f Dockerfile .
```

```bash
# Tag Docker image
docker tag pipeline-auditor:latest ${REPO_URL}/pipeline-auditor:latest
```

```bash
# Push Docker image to Snowflake
docker push ${REPO_URL}/pipeline-auditor:latest
```

### Update service (retains the same app URL)

If you also changed the spec, re-upload it first:

```bash
snow stage copy spcs/spcs-spec.yaml @AUDITOR_SPCS.APPS.SPECS --overwrite -c your-snowcli-connection-name
```

Then update the service:

```bash
snow sql -c your-snowcli-connection-name -f spcs/spcs-update.sql
```

## Common Issues

**Build fails with memory error?**
- Increase memory: `NODE_OPTIONS="--max-old-space-size=8192" npm run build`

**"exec format error"?**
- Missing `--platform linux/amd64` flag in docker build

**Cortex Code Agent SDK errors?**
- Ensure the PAT secret is valid and not expired
- Verify `ALLOW_ALL_INTEGRATION` is attached (required for SDK to reach Snowflake APIs)
- Check that `SNOWFLAKE_ACCOUNT` and `SNOWFLAKE_HOST` are set correctly in the spec

**Can't see logs?**
```bash
snow sql -c your-snowcli-connection-name -q "USE AUDITOR_SPCS.APPS; CALL SYSTEM\$GET_SERVICE_LOGS('PIPELINE_AUDITOR_SERVICE', '0', 'auditor', 100);"
```
