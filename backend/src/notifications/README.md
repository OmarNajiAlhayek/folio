# Notifications module

In-app notifications (persisted in PostgreSQL) with optional live delivery over **Server-Sent Events (SSE)**.

## Live delivery (`NotificationHub`)

`NotificationHub` is an **in-process RxJS `Subject`**. `emitCreated()` pushes events only to SSE connections handled by **the same Node.js process** that created the notification.

| Deployment | Behavior |
|------------|----------|
| Single instance / local dev | Works as implemented. |
| Multiple replicas / rolling deploy | Clients on instance A do **not** receive events emitted on instance B. Users still see new items after refresh, bell open, or the next list fetch. |

### Before horizontal scaling

Replace or back the hub with a shared pub/sub layer, for example:

- Redis pub/sub (or Redis Streams) with one channel per `userId`, or
- A managed broker (NATS, etc.).

Keep the public contract unchanged: SSE `connected`, `notification`, and `heartbeat` event types. Only the transport behind `NotificationHub.emitNotification` needs to fan out across instances.

The initial `connected` event (unread count) is sent directly from `NotificationsController` and does not depend on the hub bus.
