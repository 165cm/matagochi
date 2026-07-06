import test from "node:test";
import assert from "node:assert/strict";
import { getSyncRoom, putSyncRoom } from "../src/sync.js";
import { createMemorySyncStore } from "../src/syncStore.js";

const ROOM_ID = "a".repeat(64);

function payload(overrides = {}) {
  return {
    version: 1,
    family: ["ママ", "パパ"],
    servingCount: 2,
    recipes: [],
    evaluations: [],
    tombstones: { recipes: {}, evaluations: {} },
    planOverrides: {},
    ...overrides
  };
}

test("returns found:false for an empty room", async () => {
  const store = createMemorySyncStore();
  assert.deepEqual(await getSyncRoom(store, ROOM_ID), { found: false });
});

test("rejects malformed room ids", async () => {
  const store = createMemorySyncStore();
  await assert.rejects(getSyncRoom(store, "short"), (error) => error.code === "invalid_room_id");
  await assert.rejects(getSyncRoom(store, "Z".repeat(64)), (error) => error.code === "invalid_room_id");
});

test("returns 503 when the store is not configured", async () => {
  await assert.rejects(getSyncRoom(null, ROOM_ID), (error) => error.status === 503 && error.code === "sync_not_configured");
  await assert.rejects(putSyncRoom(null, ROOM_ID, { data: payload() }), (error) => error.status === 503);
});

test("stores and returns a room payload", async () => {
  const store = createMemorySyncStore();
  const data = payload({ recipes: [{ id: "r1", title: "テスト" }] });
  const saved = await putSyncRoom(store, ROOM_ID, { data, baseRevision: "" });
  assert.ok(saved.revision);
  assert.ok(saved.updatedAt);

  const fetched = await getSyncRoom(store, ROOM_ID);
  assert.equal(fetched.found, true);
  assert.equal(fetched.revision, saved.revision);
  assert.deepEqual(fetched.data, data);
});

test("rejects invalid sync data", async () => {
  const store = createMemorySyncStore();
  await assert.rejects(putSyncRoom(store, ROOM_ID, {}), (error) => error.code === "invalid_sync_data");
  await assert.rejects(putSyncRoom(store, ROOM_ID, { data: [] }), (error) => error.code === "invalid_sync_data");
  await assert.rejects(
    putSyncRoom(store, ROOM_ID, { data: { recipes: "x", evaluations: [] } }),
    (error) => error.code === "invalid_sync_data"
  );
});

test("rejects writes with a stale base revision", async () => {
  const store = createMemorySyncStore();
  const first = await putSyncRoom(store, ROOM_ID, { data: payload(), baseRevision: "" });
  await putSyncRoom(store, ROOM_ID, { data: payload({ servingCount: 3 }), baseRevision: first.revision });

  await assert.rejects(
    putSyncRoom(store, ROOM_ID, { data: payload({ servingCount: 4 }), baseRevision: first.revision }),
    (error) => error.status === 409 && error.code === "sync_conflict"
  );
});

test("rejects a second create into the same empty room", async () => {
  const store = createMemorySyncStore();
  await putSyncRoom(store, ROOM_ID, { data: payload(), baseRevision: "" });
  await assert.rejects(
    putSyncRoom(store, ROOM_ID, { data: payload(), baseRevision: "" }),
    (error) => error.status === 409
  );
});

test("memory store enforces generation preconditions", async () => {
  const store = createMemorySyncStore();
  const envelope = { revision: "rev-1", updatedAt: "2026-07-06T00:00:00.000Z", data: payload() };
  assert.deepEqual(await store.put(ROOM_ID, envelope, { ifGeneration: 0 }), { generation: 1 });
  assert.equal(await store.put(ROOM_ID, envelope, { ifGeneration: 0 }), null);
  assert.deepEqual(await store.put(ROOM_ID, envelope, { ifGeneration: 1 }), { generation: 2 });
});
