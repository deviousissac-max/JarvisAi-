# JARVIS — Personal AI Assistant (iPhone PWA)

Dark HUD-style PWA. React + TypeScript frontend, Node + TypeScript backend,
Groq AI (streaming chat + tool calling + Whisper STT), Fish Audio voice.
API keys are set as environment variables on the host — never committed.

## Deploy on Render
1. Import this repo at render.com, New Web Service, plan: Free.
   Build command and start command come from render.yaml.
2. Set environment variables in the Render dashboard:
   - GROQ_API_KEY
   - FISH_AUDIO_API_KEY
   - FISH_AUDIO_MODEL_ID = 14129c3e320149449d6bada6862f7338
   - optional: TAVILY_API_KEY (web search), APP_ACCESS_TOKEN (locks API to your device)
3. Deploy. The service serves both the API (/api/*) and the built frontend.

## Install on iPhone
Open the service URL in Safari, Share, Add to Home Screen, launch.
Allow microphone access when first prompted.

## Local development
    npm run install:all
    npm run dev                 # backend :8787
    cd app && npm run dev       # frontend :5173 (proxies /api)

## Notes
- server/.env is git-ignored; rotate any keys that have transited chat.
- iOS voice input uses server-side Whisper transcription; on-device Web Speech
  is used when the browser supports it.
