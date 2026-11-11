# Prompt Chain Tool

Superadmin-only tool for managing prompt chains (`prompt_chains`) and their steps (`prompt_chain_steps`) on the humor-project-week1 Supabase database.

- Create / rename / pin / delete chains; create / edit / delete steps; reorder steps (↑ ↓)
- **Generate media**: runs the chain's steps in order on a test image (Gemini / OpenAI / Anthropic, picked from each step's model) and logs every call to `generation_requests` + `llm_responses`
- View every run of a chain: source image, final output, and each step's output
- Light / dark / system theme
- Access gated on `profiles.is_superadmin = TRUE` (page level, re-checked in every server action and the API route; database RLS enforces it too)

## Env vars
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, plus `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` for the providers your steps use.

## Prompt syntax
Reference earlier step results with `{{step_1_output}}`, `{{step_2_output}}`, … If a later step has no placeholder, the previous output is appended automatically. Steps with output type `array` should return a JSON array of strings.
