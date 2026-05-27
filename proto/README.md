# Folio protobuf contracts

Cross-language API definitions between the Nest backend and Python microservices.

## Layout

| Path | Purpose |
|------|---------|
| `folio/ai/v1/classifier.proto` | AraBERT classify RPCs (`ClassifierService`) |
| `buf.yaml` | Lint and breaking-change config |
| `buf.gen.yaml` | Codegen plugins (Python + TypeScript) |

## Generated output (committed)

Run from repo root after editing `.proto`:

```bash
npm run proto:gen
```

Outputs:

- Python → `services/ai-service/app/grpc/gen/`
- TypeScript → `backend/src/ai/grpc/gen/` (ts-proto + `@grpc/grpc-js`)

CI fails if generated stubs are stale (`git diff --exit-code` on both dirs).

## Who needs Buf locally

Only contributors **changing** `.proto` or `buf.gen.yaml`. Everyone else uses committed stubs.

Install Buf CLI:

- **Windows:** `scoop install buf` or download from [buf.build/docs/installation](https://buf.build/docs/installation)
- **macOS:** `brew install bufbuild/buf/buf`
- **npm (repo root):** `npx buf` after `npm ci` at repo root (`@bufbuild/buf` devDependency)

Pinned in CI via `bufbuild/buf-action@v1` (see `.github/workflows/ci.yml`).

## TypeScript plugin

Uses **`buf.build/community/stephenh-ts-proto`** with:

- `outputServices=grpc-js`
- `env=node`
- `esModuleInterop=true`

Nest uses generated stubs directly — no `@grpc/proto-loader` at runtime.

## Lint

```bash
npm run proto:lint
```

Optional later (after first proto is on `main`):

```bash
buf breaking proto --against '.git#branch=main'
```
