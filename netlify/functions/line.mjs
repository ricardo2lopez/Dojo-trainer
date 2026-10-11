// DOJO server line: keeps each room of the two-station line (status of both stations and the boards sent from station 1 to station 2).
// Netlify Function (v2) with Netlify Blobs. Served at /api/line on the same site as the trainer.
export const config = { path: "/api/line" };

const ROOM = /^[A-Z0-9-]{1,12}$/;
const pad = n => String(n).padStart(15, "0");

export async function handle(store, body, now = Date.now()) {
  const room = String(body?.room || "").toUpperCase();
  const role = Number(body?.role);
  if (!ROOM.test(room) || (role !== 1 && role !== 2)) return { status: 400, json: { error: "bad room or role" } };
  const op = String(body?.op || "status");
  const me = `${room}/st${role}`, other = `${room}/st${3 - role}`, qp = `${room}/q/`;
  const status = { ...(body.status && typeof body.status === "object" ? body.status : {}), seen: now };
  await store.setJSON(me, status);
  const listQ = async () => ((await store.list({ prefix: qp })).blobs || []).map(b => b.key).sort();
  if (op === "join" && role === 1) { for (const k of await listQ()) await store.delete(k); }
  let board = null;
  if (op === "send" && role === 1 && body.board && typeof body.board === "object") {
    await store.setJSON(qp + pad(now) + "-" + Math.random().toString(36).slice(2, 8), body.board);
  }
  if (op === "take" && role === 2) {
    const keys = await listQ();
    if (keys.length) { board = await store.get(keys[0], { type: "json" }); await store.delete(keys[0]); }
  }
  const p = await store.get(other, { type: "json" });
  const partner = p ? { ...p, age: now - (p.seen || 0) } : null;
  const queue = (await listQ()).length;
  return { status: 200, json: { ok: true, partner, queue, board } };
}

export default async (req) => {
  if (req.method !== "POST") return new Response("DOJO line server", { status: 200 });
  let body; try { body = await req.json(); } catch (e) { return Response.json({ error: "bad json" }, { status: 400 }); }
  const { getStore } = await import("@netlify/blobs");
  const store = getStore({ name: "dojo-line", consistency: "strong" });
  const r = await handle(store, body);
  return Response.json(r.json, { status: r.status, headers: { "cache-control": "no-store" } });
};
