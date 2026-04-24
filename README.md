# Overview

This application provides an automated pipeline auditing interface for Snowflake data pipelines. It uses the [Cortex Code Agent SDK](https://docs.snowflake.com/en/developer-guide/snowflake-cli/cortex-code/cortex-code-agent-sdk) to analyze your database schemas — auditing tasks, dynamic tables, streams, pipes, and more — and provides actionable fix suggestions with follow-up chat. The interface is built with React, TypeScript, and Material-UI.

Use this as a starter project or template and extend or customize it. Also note that the agent can make mistakes, so double-check responses.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Setup Steps](#setup-steps)
    - [1. Clone Repo](#1-clone-repo)
    - [2. Install Dependencies](#2-install-dependencies)
    - [3. Configure Snow CLI](#3-configure-snow-cli)
- [Launch Application](#launch-application)
    - [Demo](#demo)
    - [Usage](#usage)
    - [Implemented Features](#implemented-features)
    - [Future Enhancements](#future-enhancements)
    - [Common Issues](#common-issues)
- [Optimized Build](#optimized-build)
- [Deploy To Snowpark Container Services](#deploy-to-snowpark-container-services)
- [Questions](#questions)

---

## Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 9.0.0
- **Snow CLI** installed and configured with a named connection
- **Snowflake Account**
    - With a role that has access to the database(s) you want to audit
    - [Cortex Code CLI](https://docs.snowflake.com/en/developer-guide/snowflake-cli/cortex-code/cortex-code-overview) installed (required by the Agent SDK)

## Setup Steps

### 1. Clone Repo

Clone this repository to get the required files.

```bash
git clone https://github.com/iamontheinet/awesome-pipeline-auditor-with-cortex-agents-sdk.git
cd awesome-pipeline-auditor-with-cortex-agents-sdk
```

* Folders
    - `src/` — Frontend React application
    - `server/` — Backend Express server
    - `spcs/` — Snowpark Container Services deployment files

* Files
    - `package.json`
    - `vite.config.ts`
    - `tsconfig.json`
    - `tsconfig.server.json`
    - `Dockerfile`

    > #### Expand to see the folder structure and file details.
    <details>
    <summary>Folder structure</summary>

    ```
    ├── src/                                    # Frontend React application
    │   ├── App.tsx                             # Root app with router and layout
    │   ├── main.tsx                            # Entry point with ThemeProvider
    │   ├── theme.ts                            # MUI dark/light theme definitions
    │   ├── types.ts                            # Shared TypeScript types
    │   ├── ThemeContext.tsx                     # Theme state (localStorage persistence)
    │   │
    │   ├── components/                         # UI Components
    │   │   ├── AuditDashboard.tsx              # Main dashboard orchestrating audit flow
    │   │   ├── AuditHeader.tsx                 # Command bar: db/schema selects, scope pills, run
    │   │   ├── AuditSidebar.tsx                # Real-time audit progress with stats
    │   │   ├── ChatInput.tsx                   # Message input for follow-up chat
    │   │   ├── ChatThread.tsx                  # Follow-up chat thread display
    │   │   ├── EmptyState.tsx                  # Landing state before first audit
    │   │   ├── ReportPanel.tsx                 # Audit report with markdown, Suggest Fix dialog
    │   │   ├── ScheduleDialog.tsx              # Create/manage recurring audit schedules
    │   │   ├── SchedulePanel.tsx               # Collapsible sidebar with schedules & history
    │   │   └── ToolProgress.tsx                # Agent tool execution progress display
    │   │
    │   └── hooks/                              # Custom React hooks
    │       ├── useAudit.ts                     # Core audit polling (POST → poll GET)
    │       ├── useAuditHistory.ts              # Past audit results loader
    │       ├── usePermissions.ts               # Role-based permission check
    │       ├── useScheduler.ts                 # CRUD for recurring audit schedules
    │       └── useSuggestFix.ts                # Suggest Fix session management
    │
    ├── server/                                 # Backend Express server
    │   ├── index.ts                            # Express server with Cortex Code Agent SDK
    │   └── snow_sql.py                         # Python SQL helper (SPCS-native auth)
    │
    ├── spcs/                                   # Snowpark Container Services deployment
    │   ├── spcs-setup.sql                      # Initial Snowflake object setup
    │   ├── spcs-create-service.sql             # Create SPCS service
    │   ├── spcs-update.sql                     # Update service (retains endpoint URL)
    │   ├── spcs-spec.yaml.example              # Service spec template
    │   └── README.md                           # SPCS deployment guide
    │
    ├── sql/                                    # Snowflake SQL scripts
    │   └── create_procedure.sql                # Stored procedure for scheduled audits
    │
    ├── Dockerfile                              # Multi-stage Docker build (for SPCS)
    ├── entrypoint.sh                           # Container entrypoint (for SPCS)
    │
    ├── package.json                            # Dependencies & npm scripts
    ├── vite.config.ts                          # Vite bundler configuration
    ├── tsconfig.json                           # Frontend TypeScript config
    ├── tsconfig.server.json                    # Server TypeScript config
    │
    └── README.md                               # Main documentation (you are here!)
    ```
    </details>

### 2. Install Dependencies

Browse to the cloned repo folder on your local machine. Then, run the following command in a terminal window.

```bash
npm install
```

This creates the `node_modules/` folder with all required packages.

### 3. Configure Snow CLI

The app uses your existing Snow CLI named connection. Make sure you have a connection configured:

```bash
snow connection list
```

If you need to create one, refer to the [Snow CLI docs](https://docs.snowflake.com/en/developer-guide/snowflake-cli/connecting/specify-credentials).

The connection name defaults to `default`. To use a different connection, set the `SNOW_CONNECTION` environment variable:

```bash
export SNOW_CONNECTION=your-connection-name
```

## Launch Application

Browse to the cloned repo folder on your local machine. Then, run the following command in a terminal window to launch both the frontend application and the backend server.

```bash
npm run dev
```

Then open [http://localhost:5173](http://localhost:5173) in a browser window.

### Demo

> TODO: Add demo video

### Usage

1. Select a **database** and **schema** from the dropdowns
2. Choose which pipeline components to audit using the **scope pills** (Tasks, Dynamic Tables, Streams, Pipes, etc.)
3. Click **Run Audit** to start the analysis
4. Review the audit report with findings and recommendations
5. Click **Suggest Fix** on any finding to get an AI-powered fix with a chat interface for follow-up questions
6. Optionally **schedule recurring audits**, **download reports**, or **email results**

### Implemented Features

* Schema-scoped pipeline auditing (tasks, dynamic tables, streams, pipes, stages, alerts)
* Real-time audit progress with tool execution tracking
* AI-powered fix suggestions with multi-turn follow-up chat
* Copy-to-clipboard on all code blocks
* Recurring audit schedules (backed by Snowflake Tasks)
* Collapsible schedule panel with past audit history
* Download audit reports as JSON
* Email audit reports (requires Snowflake email integration)
* Dark and light themes with localStorage persistence

### Future Enhancements

* Enable inline SQL execution from suggested fixes
* Cross-schema auditing
* Audit report diffing between runs

### Common Issues

1. **Cannot connect to backend** — Make sure the backend server is running. If using `npm run dev`, both the frontend and backend start together via `concurrently`.

2. **"Connection not found" error** — Verify your Snow CLI connection name matches the `SNOW_CONNECTION` environment variable (or `default`).

3. **Audit hangs or returns no data** — Ensure your role has `USAGE` on the target database and schema. The auditor runs `SHOW` commands which require appropriate privileges.

4. **Suggest Fix not working** — The Suggest Fix feature requires the Cortex Code CLI to be installed and accessible on the system PATH.

5. **Port already in use**

    ```bash
    # Kill frontend (port 5173)
    lsof -ti:5173 | xargs kill -9

    # Kill backend (port 3001)
    lsof -ti:3001 | xargs kill -9
    ```

## Optimized Build

Browse to the cloned repo folder on your local machine. Then, run the following command in a terminal window.

```bash
npm run build
```

This compiles:
- Frontend → `dist/` (Vite production build)
- Server → `dist-server/` (TypeScript compiled to JavaScript)

To start the production build:

```bash
npm start
```

## Deploy To Snowpark Container Services

If you'd like to deploy this app to Snowpark Container Services in your account, [follow the instructions outlined here](spcs/README.md).

## Questions

If you have any questions, comments or feedback, please reach out to [Dash DesAI](https://www.linkedin.com/in/dash-desai/).
