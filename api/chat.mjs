import OpenAI from "openai";

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(501).json({
      error: "GROQ_API_KEY is not configured for this deployment.",
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
    const model = process.env.GROQ_MODEL || process.env.OPENAI_MODEL || "llama-3.3-70b-versatile";
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

    return res.json({
      answer: completion.choices[0]?.message?.content || "I could not generate an answer for this context.",
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "AI request failed.",
    });
  }
}
