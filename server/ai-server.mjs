import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const app = express();
const port = Number(process.env.PORT || 8787);
const model = process.env.GROQ_MODEL || process.env.OPENAI_MODEL || "llama-3.3-70b-versatile";

app.use(express.json({ limit: "1mb" }));

const systemPrompt = `
You are KrishiRoute AI, a business copilot for Syngenta field teams.
Your user is a sales representative or manager, not a data scientist.
Answer in practical field language.
Use the selected recommendation context and dashboard metrics provided by the app.
Do not talk about model internals unless asked.
Focus on: where to go, what to recommend, why it matters, what risk or opportunity exists, and what to say to the retailer/farmer.
If asked for a plan, give an ordered action list.
If asked for talking points, keep them short and field-ready.
`;

app.post("/api/chat", async (req, res) => {
  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(501).json({
      error: "GROQ_API_KEY is not set. Set it in .env or the terminal running the AI server, then restart.",
    });
  }

  const { message, context, history = [] } = req.body ?? {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message is required." });
  }

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
    });
    const trimmedHistory = Array.isArray(history) ? history.slice(-8) : [];
    const completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Current app context:\n${JSON.stringify(context ?? {}, null, 2)}`,
        },
        ...trimmedHistory.map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: String(item.content ?? ""),
        })),
        { role: "user", content: message },
      ],
      temperature: 0.35,
      max_tokens: 700,
    });

    res.json({
      answer: completion.choices[0]?.message?.content || "I could not generate an answer for this context.",
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "AI request failed.",
    });
  }
});

app.use(express.static(path.join(root, "dist")));

app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(root, "dist", "index.html"));
});

app.listen(port, () => {
  console.log(`KrishiRoute AI server running on http://127.0.0.1:${port}`);
});
