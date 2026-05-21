# KrishiRoute AI

AI-guided field force copilot for the Syngenta IITM BS Paradox hackathon.

KrishiRoute AI helps field representatives decide which retailers to visit, what product action to recommend, why the recommendation matters, and what business impact is expected. The prototype combines deterministic opportunity scoring, trained ML signals, and a Groq-powered AI copilot for field-ready explanations and pitches.

## Run Locally

```bash
npm install
npm run dev:api
npm run dev -- --port 5173
```

Open `http://127.0.0.1:5173/`.

## Environment

Create `.env` from `.env.example` and add your Groq API key.

## Notes

Raw hackathon datasets and local environment files are intentionally excluded from git. The checked-in generated analytics files are used by the local prototype UI.
