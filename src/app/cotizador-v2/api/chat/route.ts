import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HistoryItem = {
  role?: "user" | "assistant";
  text?: string;
};

function extractResponseText(payload: any): string {
  if (!payload) return "";
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  if (Array.isArray(payload.output)) {
    const chunks: string[] = [];
    for (const item of payload.output) {
      const content = Array.isArray(item?.content) ? item.content : [];
      for (const c of content) {
        if (typeof c?.text === "string" && c.text.trim()) chunks.push(c.text.trim());
      }
    }
    if (chunks.length) return chunks.join("\n\n");
  }
  return "";
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Falta configurar OPENAI_API_KEY en Vercel." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const question = String(body?.question || "").trim();
    const context = String(body?.context || "").trim();
    const includeWeb = Boolean(body?.includeWeb);
    const history = Array.isArray(body?.history) ? (body.history as HistoryItem[]) : [];

    if (!question) {
      return NextResponse.json({ ok: false, error: "Pregunta vacía." }, { status: 400 });
    }

    const input: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      {
        role: "system",
        content:
          "Eres un analista financiero y operativo de Scontainr. Responde en español, usa números concretos y recomendaciones accionables.",
      },
    ];

    if (context) {
      input.push({
        role: "system",
        content: `Contexto interno del cotizador:\n${context}`,
      });
    }

    for (const item of history.slice(-12)) {
      if (!item?.text || (item.role !== "user" && item.role !== "assistant")) continue;
      input.push({ role: item.role, content: String(item.text) });
    }

    input.push({ role: "user", content: question });

    const openAIReq: Record<string, any> = {
      model: process.env.OPENAI_CHAT_MODEL || "gpt-4.1-mini",
      input: input.map((m) => ({
        role: m.role,
        content: [{ type: "input_text", text: m.content }],
      })),
      temperature: 0.2,
    };

    if (includeWeb) {
      openAIReq.tools = [{ type: "web_search_preview" }];
    }

    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openAIReq),
    });

    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const msg =
        payload?.error?.message ||
        payload?.message ||
        `OpenAI error (${upstream.status})`;
      return NextResponse.json({ ok: false, error: msg }, { status: upstream.status });
    }

    const answer = extractResponseText(payload);
    if (!answer) {
      return NextResponse.json(
        { ok: false, error: "No se pudo extraer respuesta del modelo." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, answer });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error?.message || "Error interno en chat." },
      { status: 500 }
    );
  }
}
