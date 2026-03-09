# @noverax/nexus — Documentation

Documentation site and interactive examples for `@noverax/nexus`, built with Next.js and a live Express mock backend.

## Architecture

```
Browser ──► Next.js :3000 (proxy) ──► Express :4000 (backend)
                │
                ├─ Proxy mode:   createClientRequest → apiRoute → backend
                └─ Direct mode:  createDirectRequest → backend (no proxy hop)
```

## Quick Start

```bash
# from repo root
cd docs
npm install
npm run dev
```

This starts both servers concurrently:
- **Next.js** on [http://localhost:3000](http://localhost:3000)
- **Express** on [http://localhost:4000](http://localhost:4000)

## Examples

### Getting Started

| Page | Route | Description |
|------|-------|-------------|
| Basic | `/basic` | Simple GET/POST with `useQuery` and `useMutation` |
| CRUD | `/crud` | Full create, read, update, delete cycle |

### Proxy Mode

| Page | Route | Description |
|------|-------|-------------|
| Groups | `/groups` | `EndpointGroup` with prefix, `group:method` syntax |
| Path Params | `/path-params` | Dynamic `:id`, `:postId` URL segments |
| Encoding | `/encoding` | Custom `bodyEncoder` and `searchParamsEncoder` |
| Upload | `/upload` | FormData file upload with `onUploadProgress` |

### Server-Side

| Page | Route | Description |
|------|-------|-------------|
| Direct | `/direct` | RSC with `createDirectRequest` (no proxy hop) |
| Actions | `/actions` | Server Actions + direct mode with `revalidatePath` |

### Advanced

| Page | Route | Description |
|------|-------|-------------|
| Hooks | `/hooks` | `onRequest`, `onResponse`, `onError` lifecycle hooks |
| Errors | `/errors` | `HTTPError` class, `isHTTPError` guard, global handlers |
| Abort | `/abort` | `AbortController`, manual cancel, request deduplication |
| Streaming | `/streaming` | `stream: true` with SSE progressive rendering |
| Raw Data | `/raw-data` | `rawData: true` — access status, headers, and data |
| Options | `/options` | `timeout`, `retry`, `cache`, Next.js `revalidate` |
| Singleton | `/singleton` | Module augmentation, typed singleton pattern |

## Tech Stack

- **Next.js 16** (App Router, React 19)
- **Tailwind CSS v4** (CSS-first config)
- **shadcn/ui** (OKLCH colors, React 19)
- **Express 5** (mock backend)
- **@tanstack/react-query** (data fetching)

## Project Structure

```
docs/
├── server/                    # Express 5 mock backend
│   ├── index.ts               # App entry, listen on :4000
│   ├── routes/                # Route handlers
│   └── data.ts                # In-memory data store
│
└── src/
    ├── app/                   # Next.js pages (docs + examples)
    │   └── api/request/       # nexus apiRoute (proxy endpoint)
    ├── api/                   # nexus source definitions
    ├── lib/                   # request instances, utils
    └── components/            # UI components, layout, shared
```

## Express Mock Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users` | List users (`?page`, `?limit`, `?search`) |
| GET | `/users/:id` | Get user by ID |
| POST | `/users` | Create user |
| PUT | `/users/:id` | Update user |
| PATCH | `/users/:id` | Partial update |
| DELETE | `/users/:id` | Delete user |
| GET | `/users/:id/posts/:postId` | Nested path params |
| GET/POST | `/posts` | List / create posts |
| POST | `/upload` | File upload (multer) |
| GET | `/stream` | Streaming response (chunked) |
| GET | `/slow` | 3s delayed response |
| GET | `/error/:code` | Returns specific HTTP error |
