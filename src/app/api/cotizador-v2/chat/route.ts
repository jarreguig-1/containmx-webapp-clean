import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = { role: "user" | "assistant"; content: string };

type ChatPayload = {
  question: string;
  context: string;
  history?: ChatMessage[];
  includeWeb?: boolean;
};

function getApiKey() {
  return process.env.OPENAI_API_KEY || "";
}

function buildInput(payload: ChatPayload) {
  const history = Array.isArray(payload.history) ? payload.history : [];
  const limitedHistory = history.slice(-8);

  const msgs = [
    {
      role: "system",
      content:
        "Eres analista financiero y operativo de Scontainr. " +
        "Responde en español, concreto y accionable. " +
        "Si te piden costos de mercado, indica supuestos y nivel de confianza. " +
        "Usa el contexto del proyecto como fuente principal.",
    },
    {
      role: "system",
      content: `Contexto del cotizador:\n${payload.context || "Sin contexto."}`,
    },
  ];

  for (const m of limitedHistory) {
    if (!m?.content) continue;
    msgs.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
  }

  msgs.push({
    role: "user",
    content: payload.question,
  });

  return msgs;
}

function extractText(data: any): string {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const output = Array.isArray(data?.output) ? data.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (c?.type === "output_text" && typeof c?.text === "string") chunks.push(c.text);
      if (c?.type === "text" && typeof c?.text === "string") chunks.push(c.text);
    }
  }
  return chunks.join("\n").trim();
}

export async function POST(req: Request) {
  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "OPENAI_API_KEY no está configurada en el servidor." },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => null)) as ChatPayload | null;
  if (!body?.question || !body?.question.trim()) {
    return NextResponse.json({ ok: false, error: "Pregunta vacía." }, { status: 400 });
  }

  const includeWeb = !!body.includeWeb;
  const payload: any = {
    model: "gpt-4.1-mini",
    input: buildInput(body),
  };

  if (includeWeb) {
    payload.tools = [{ type: "web_search_preview" }];
  }

  try {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = data?.error?.message || `Error OpenAI (${res.status})`;
      return NextResponse.json({ ok: false, error: err }, { status: 500 });
    }

    const text = extractText(data);
    return NextResponse.json({ ok: true, answer: text || "No se recibió texto de respuesta." });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Error de conexión con OpenAI." },
      { status: 500 }
    );
  }
}
