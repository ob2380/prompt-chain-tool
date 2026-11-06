# Prompt Chain Tool

Superadmin-only tool for managing humor-flavor prompt chains (`humor_flavors`) and their steps (`humor_flavor_steps`).

- Create / rename / delete chains; create / edit / delete steps; reorder steps (↑ ↓)
- **Generate media**: runs the chain's steps in order on a test image (Gemini / OpenAI / xAI, picked from each step's model), logs every call to `llm_model_responses`, saves captions to `captions` (with `humor_flavor_id` + `llm_prompt_chain_id`)
- View all captions produced by a chain, grouped by image
- Light / dark / system theme
- Access gated on `profiles.is_superadmin = TRUE` (page level, plus re-checked in every server action and the API route)

## Run locally
```bash
cp .env.local.example .env.local   # fill in GEMINI_API_KEY etc.
npm install
npm run dev                        # http://localhost:3000
```

## Deploy
1. New GitHub repo → push this folder.
2. Vercel → Import the repo. Add the env vars from `.env.local.example`.
3. Vercel → Settings → Deployment Protection → **Disable** (so Incognito works).
4. Supabase → Authentication → URL Configuration: add `https://<your-vercel-domain>/auth/callback` to Redirect URLs.
5. Submit the commit-specific deployment URL.

## Prompt syntax
Reference earlier step results in a user prompt with `${step1Output}`, `${step2Output}`, … (same convention as the existing flavors). If a later step has no placeholder, the previous output is appended automatically. Steps with output type `array` should return a JSON array of strings; the last step's output becomes the captions.
