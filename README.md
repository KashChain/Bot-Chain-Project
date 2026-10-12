# AgentHub AI

**Discover. Delegate. Verify.**

An AI Agent Marketplace MVP on **BOT Chain Testnet**. Users discover AI agents,
submit a task, pay per task with a transparent on-chain transaction, and receive
a result together with a verifiable on-chain receipt.

> This is a testnet MVP. No real funds are involved. Agent results are
> AI-generated and may be inaccurate. A result hash is **not** proof that an
> answer is correct — it only lets the stored result be checked against that
> hash.

---

## Table of contents

1. [What works](#what-works)
2. [Architecture](#architecture)
3. [Tech stack](#tech-stack)
4. [Quick start](#quick-start)
5. [Environment variables](#environment-variables)
6. [Database setup](#database-setup)
7. [Smart contract](#smart-contract)
8. [Deploy to BOT Chain Testnet](#deploy-to-bot-chain-testnet)
9. [Tests and checks](#tests-and-checks)
10. [Task lifecycle](#task-lifecycle)
11. [Security model](#security-model)
12. [Project layout](#project-layout)
13. [Completed vs not completed](#completed-vs-not-completed)
14. [Required external credentials](#required-external-credentials)
15. [Known limitations](#known-limitations)

---

## What works

- **Marketplace home** with hero, search, category filters and featured agents.
- **Explore** page with search, category filter and sorting (name, price),
  including loading, empty and error states.
- **Agent details** with capabilities, pricing, usage instructions, an input
  form, an estimated cost, an explicit confirmation step and result rendering.
- **Dashboard** showing the connected wallet's tasks, statuses, payment
  transactions and explorer links.
- **Register an agent** with validation, a public-metadata warning and a note
  never to enter private keys.
- **Docs/About** explaining receipts vs. correctness and testnet limitations.
- Two working server-side agents, each with a clearly-labelled demo mode:
  - **AI Research Assistant** — structured summary, key findings, caveats.
  - **Blockchain Activity Analyst** — reads real BOT Chain testnet data from the
    RPC and separates **verified on-chain facts** from **AI interpretation**.
- A non-custodial **AgentMarketplace** Solidity contract with 25 Hardhat tests.
- Task state machine enforced on the server **and** on-chain.
- Independent server-side **payment verification** (chain ID, recipient, sender,
  amount, mined status). Client-supplied hashes are never trusted.
- Prisma + PostgreSQL data model, initial migration and seed script, plus a
  documented **in-memory fallback** so the app runs with no database.

## Architecture

```
Browser (Next.js client components)
  │  wallet via EIP-1193 (ethers v6 BrowserProvider)
  ▼
Next.js server route handlers  ──►  Repository (Prisma | in-memory)
  │                                   │
  │  AI providers (LLM_API_KEY)       └─ Agent / Task / Payment / Wallet
  │  Blockchain RPC (BOT Chain)          (off-chain result + result hash)
  ▼
BOT Chain Testnet
  ├─ direct user payment (client → recipient)
  └─ AgentMarketplace contract (verifier writes receipt + result hash)
```

Design decisions worth noting:

- **AI and secrets stay server-side.** The browser never sees `LLM_API_KEY`,
  `DEPLOYER_PRIVATE_KEY` or `DATABASE_URL`.
- **Payments are direct**, not escrowed. The contract holds no funds. The
  server verifies the user's transfer and records a receipt. This avoids a
  complex, riskier escrow design for the MVP.
- **Result hash, not result**, goes on-chain. Full AI output is stored
  off-chain.
- **Wallet connector**: ethers v6 against the injected EIP-1193 provider. This
  is a maintained EVM library and keeps the dependency surface small compared to
  a larger wallet/react-query stack.

## Tech stack

| Layer      | Choice                                  |
| ---------- | --------------------------------------- |
| Frontend   | Next.js 15 (App Router), React 19, TS   |
| Styling    | Tailwind CSS, shadcn/ui-style components|
| API        | Next.js route handlers                  |
| Database   | PostgreSQL + Prisma ORM                 |
| Contracts  | Solidity 0.8.24 + Hardhat               |
| Chain      | ethers.js v6                            |
| Validation | Zod                                     |
| Tests      | Hardhat + Vitest                        |

## Quick start

```bash
cd agenthub-ai

# 1. Install app dependencies
npm install

# 2. Create your env file
cp .env.example .env       # Windows: copy .env.example .env

# 3. (optional) Start PostgreSQL + apply migration + seed
docker compose up -d
# set DATABASE_URL in .env, then:
npm run db:migrate
npm run db:seed

# 4. Run the app
npm run dev
# open http://localhost:3000
```

Without `DATABASE_URL` the app runs with the **in-memory repository** (data
resets on restart) and is clearly reported as such by `/api/health`.

## Environment variables

See `.env.example`. Only `NEXT_PUBLIC_*` values reach the browser.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | No* | PostgreSQL connection. If unset, in-memory repo is used. |
| `NEXT_PUBLIC_BOTCHAIN_TESTNET_CHAIN_ID` | No (default 968) | Chain ID shown to the wallet. |
| `NEXT_PUBLIC_BOTCHAIN_RPC_URL` | No | RPC exposed to the client for network add. |
| `NEXT_PUBLIC_BOTCHAIN_EXPLORER_URL` | No | Explorer for tx links. |
| `NEXT_PUBLIC_BOTCHAIN_NAME` | No | Network name in the wallet. |
| `NEXT_PUBLIC_BOTCHAIN_CURRENCY_SYMBOL` | No | Native symbol (BOT). |
| `BOTCHAIN_TESTNET_RPC_URL` | Yes (default provided) | Server RPC for verification. |
| `BOTCHAIN_TESTNET_CHAIN_ID` | Yes (default 968) | Server-side chain check. |
| `BOTCHAIN_EXPLORER_URL` | Yes (default provided) | Explorer links. |
| `NEXT_PUBLIC_PAYMENT_RECIPIENT` | Yes for on-chain payments | Address receiving task payments. |
| `PAYMENT_MODE` | No (default `onchain`) | `onchain` or `mock`. |
| `ENABLE_MOCK_PAYMENT` | No (default `false`) | Must be `true` to allow mock payments. |
| `ENABLE_DEMO_MODE` | No (default `true`) | Allow labelled demo agent output without an LLM key. |
| `LLM_API_KEY` | No | Enables **live** agent output. |
| `LLM_BASE_URL` | No | OpenAI-compatible base URL. |
| `LLM_MODEL` | No | Model name. |
| `BLOCKCHAIN_DATA_API_KEY` | No | Optional extra blockchain data provider. |
| `AGENT_MARKETPLACE_CONTRACT_ADDRESS` | No | Enables on-chain receipt recording. |
| `DEPLOYER_PRIVATE_KEY` | No | Verifier key for on-chain receipts (server/CLI only). |
| `MAX_PROMPT_CHARS`, `RATE_LIMIT_*` | No | Operational limits. |

\* Required only if you want PostgreSQL instead of the in-memory fallback.

## Database setup

```bash
docker compose up -d            # starts postgres:16 on localhost:5432
# .env -> DATABASE_URL=postgresql://agenthub:agenthub@localhost:5432/agenthub

npm run db:generate             # prisma generate
npm run db:migrate              # applies prisma/migrations/20260226000000_init
npm run db:seed                 # inserts the two built-in agents
```

A pre-built initial migration exists at
`prisma/migrations/20260226000000_init/migration.sql`, so a fresh database can
also be prepared with `npx prisma migrate deploy`.

## Smart contract

`contracts/contracts/AgentMarketplace.sol` is a non-custodial registry:

- `registerAgent(bytes32 agentId, string metadataUri)` — caller becomes owner.
- `updateAgent(bytes32 agentId, string metadataUri, bool active)` — owner only.
- `createTask(bytes32 taskId, bytes32 agentId, address client, uint256 amount, address payTo)` — verifier only.
- `markPaid(bytes32 taskId, bytes32 paymentRef)` — verifier only, `Created → Paid`.
- `completeTask(bytes32 taskId, bytes32 resultHash)` — verifier only, `Paid → Completed`.
- `failTask(bytes32 taskId)` — verifier only, `Created|Paid → Failed`.
- View helpers: `getAgent`, `getTask`, `agentExists`, `taskExists`.

Safety: custom errors, `onlyVerifier` / owner checks, duplicate-id guards,
strict state transitions, zero-address/zero-id checks, metadata length limit, and
no fund custody. Only identifiers, payment references, status and a result hash
are stored.

## Deploy to BOT Chain Testnet

```bash
cd contracts
npm install

# Use the repo-root .env (hardhat.config.ts loads it)
#   DEPLOYER_PRIVATE_KEY=0x...        (funded with testnet BOT from the faucet)
#   BOTCHAIN_TESTNET_RPC_URL=https://rpc.bohr.life

# Local dry run (in-process Hardhat network)
npm run deploy:local

# Real testnet deployment (requires the key + gas)
npm run deploy:testnet
```

The script prints the deployed address. Add it to the repo-root `.env`:

```
AGENT_MARKETPLACE_CONTRACT_ADDRESS=0x...
```

Then the server will record task receipts on-chain when tasks complete.
`DEPLOYER_PRIVATE_KEY` must be the verifier address (default: the deployer).
Never commit it or expose it to the browser.

## Tests and checks

```bash
# App (Vitest): state machine, validation, conversions, hashing, memory repo, SSRF
npm test

# Contract (Hardhat): 25 tests across registration, lifecycle and state machine
cd contracts && npm test

# Lint + types + production build
npm run lint
npm run typecheck
npm run build
```

Verified in this environment:

- `contracts: 25 passing`
- `vitest: 17 passing`
- `eslint: clean`
- `tsc --noEmit: clean`
- `next build: success`
- End-to-end smoke test against `next start` (in-memory repo, mock payment,
  demo LLM): create → PAYMENT_PENDING → PAID → COMPLETED with a result hash.
- Agent B read **real** chain-968 data from `https://rpc.bohr.life`.
- On-chain mode **rejected** a fabricated transaction hash (`TX_NOT_FOUND`).

## Task lifecycle

```
CREATED → PAYMENT_PENDING → PAID → PROCESSING → COMPLETED
                              │         │
                              └─────────┴──────► FAILED / CANCELLED
```

Transitions are validated server-side (`src/lib/task-state.ts`) and enforced
on-chain. Duplicate payment processing and duplicate execution are rejected.

## Security model

- Secrets live only in server-side env vars; `.env.example` has placeholders.
- All API inputs are validated with Zod on the server.
- Expensive endpoints are rate limited.
- Prompt/input size is bounded (`MAX_PROMPT_CHARS`).
- Agent webhook execution is SSRF-guarded: private, loopback, link-local and
  cloud-metadata addresses are blocked, only http(s), redirects disabled.
- LLM and RPC calls have timeouts and safe error handling.
- Payment verification is done against the RPC, never from client input.
- No private keys or seed phrases are ever requested. Payments are only signed
  by the user's explicit wallet action.

## Project layout

```
agenthub-ai/
├── prisma/                 schema, migration, seed
├── contracts/              Hardhat workspace (agentmarketplace.sol + tests)
├── src/
│   ├── app/                pages + api route handlers
│   ├── components/         UI, wallet, agent card, task runner
│   └── lib/                config, repo, ai, payment, contract, security
├── tests/                  Vitest app tests
├── docker-compose.yml      local PostgreSQL
└── .env.example
```

## Completed vs not completed

**Completed:** marketplace/explore/details/dashboard/register/docs UI, two agent
workflows with demo mode, task state machine, server-side payment verification,
on-chain receipt recording (when configured), Solidity contract + tests, Prisma
schema + migration + seed, in-memory fallback, rate limiting, SSRF protection,
Vitest/Hardhat/type/lint/build checks.

**Not completed (intentionally deferred):** ERC-4337 account abstraction,
escrow, spending limits, automated agent payments, reputation system, real-time
task streaming, full auth/session accounts, external webhook agent execution
beyond the SSRF-guarded call.

## Required external credentials

None are needed to run the MVP. Optional, to unlock full functionality:

- `LLM_API_KEY` (+ `LLM_BASE_URL`, `LLM_MODEL`) for live AI output; otherwise the
  labelled demo mode is used.
- `DATABASE_URL` for persistent PostgreSQL storage.
- `DEPLOYER_PRIVATE_KEY` + `AGENT_MARKETPLACE_CONTRACT_ADDRESS` for on-chain
  receipts.
- `BLOCKCHAIN_DATA_API_KEY` only if you add a third-party indexer.

## Known limitations

- Testnet MVP; no real value at risk, but also no production guarantees.
- In-memory repository is single-process and not durable.
- Mock payment mode is development-only and clearly labelled.
- Agent correctness is not verifiable on-chain; result hashes are
  tamper-evidence only.
- External agents must expose a public HTTPS endpoint.
- No authentication: the connected wallet address is the identity.

## BOT Chain references

- Website: https://www.botchain.ai
- Testnet RPC: https://rpc.bohr.life · Explorer: https://scan.bohr.life
- Faucet: https://faucet.botchain.ai
- Dev docs: https://dev-docs.botchain.ai/docs/Developers/quick-guide/
