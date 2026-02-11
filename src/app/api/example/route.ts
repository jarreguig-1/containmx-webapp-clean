export function GET() {
  return Response.json({ ok: true, source: "example", ts: Date.now() });
}