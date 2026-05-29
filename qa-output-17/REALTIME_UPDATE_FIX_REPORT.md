# Realtime Update Fix Report

Generated: 2026-05-28

## Scope

Fixed the realtime refresh gaps for outbound inbox messages, session close events, and action creation events.

## Root Cause

- `POST /inbox/conversations/:id/send` and `/send-image` committed messages but did not emit `new_message`, so other open inbox clients relied on polling.
- Session close emitted only `session_closed`; inbox list/detail did not subscribe to it and had no semantic `conversation.closed` event.
- `new_action` was emitted without `contact_id` / `conversation_id`, so contact sidebars and contact detail pages could not safely decide whether to refresh.
- Socket.IO namespace auth accepted query/header tokens only; the frontend also sends Socket.IO v5 auth payloads, so the backend connect handler needed to accept `auth`.

## Files Changed

- `backend/app/api/inbox.py`
- `backend/app/services/session_service.py`
- `backend/app/services/action_service.py`
- `backend/app/realtime/events.py`
- `backend/app/__init__.py`
- `frontend/src/app/(app)/inbox/page.tsx`
- `frontend/src/app/(app)/inbox/conversation-detail.tsx`
- `frontend/src/app/(app)/inbox/customer-sidebar.tsx`
- `frontend/src/app/(app)/actions/page.tsx`
- `frontend/src/app/(app)/contacts/[id]/page.tsx`
- `frontend/scripts/assert-realtime-event-matrix.mjs`
- `frontend/package.json`
- `backend/tests/test_message_actions.py`
- `backend/tests/test_realtime_events.py`
- `qa-output-17/realtime-two-context-playwright.js`

## Verification

- `cd backend && venv/bin/python -m pytest tests -q`
  - PASS: 41 passed, 57 warnings
- `cd frontend && npm run lint`
  - PASS
- `cd frontend && npm run test:realtime-events`
  - PASS: no emitted event is missing a frontend subscription
- `cd frontend && npm run build`
  - PASS

## Production Probe

Before deploying these local changes, a non-mutating production probe could login but timed out connecting to `/notifications`.

Observed:

- API login: OK
- `GET /socket.io/?EIO=4&transport=polling`: OK
- Socket.IO namespace `/notifications`: timeout

Local fix added:

- `handle_connect(auth=None)` for Socket.IO v5 auth payload compatibility.
- `_authenticate_ws()` now accepts auth payload, query token, and Authorization header.
- Socket.IO uses `manage_session=False`, which is compatible with the current Flask stack and is sufficient because this namespace uses JWT, not Flask sessions.

Run after deployment:

```bash
QA_FRONT=<frontend-url> QA_API=<backend-api-url> node qa-output-17/realtime-two-context-playwright.js
```

Expected:

- `/notifications` connects.
- Context A sends an internal message.
- Context B sees it within 3 seconds.
- Socket event list includes `new_message`.
