<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/lh_banner_dark.png">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/lh_banner_light.png">
    <img src="docs/assets/lh_banner_light.png" alt="Kvasir" width="640">
  </picture>
</p>

<p align="center"><strong>A personal learning system.</strong></p>

<p align="center">
  <a href="#how-it-works">How it works</a> ·
  <a href="#build-and-run">Build and run</a> ·
  <a href="docs/development.md">Documentation</a> ·
  <a href="docs/kvasir/LINEAGE.md">Lineage</a>
</p>

Kvasir teaches hard material step by step and keeps what was taught in a knowledge graph. It is a desktop app (Next.js in Electron). A mobile companion is planned.

Kvasir uses AI agents to plan and teach lessons from your current understanding to your goal. Your answers, confidence and thinking decide what comes next. Teaching builds understanding one reasoning step at a time. Practice makes it usable. The knowledge graph carries it across sessions.

![Kvasir teaching session](docs/assets/teaching-session.png)

## How it works

1. **Measure.** Before teaching, the agent finds where your understanding ends on each part the lesson depends on.
2. **Plan.** It builds a dependency map from that starting point to your goal. You can see the plan, and it adapts as the lesson goes.
3. **Teach.** Each step builds on something you already understand. You predict, get an explanation, and check your understanding. Confusions are repaired before anything is built on them.
4. **Practice.** Separate sessions pose varied problems that need the right knowledge to come to mind unprompted. Problems and hints adapt to your reasoning.

**Think out loud.** The thinking fields take your reasoning, doubts and reactions in your own words, by typing or dictation. They give the agent a detailed picture of how you think.

The agent can also research questions in the background, draw visual explanations and build interactive demonstrations.

## Knowledge that carries forward

What you are taught is stored as propositions and reasoning chains: individual claims and the premises that lead to them. The graph shows this structure, with links back to the sessions it came from. You can also import notes.

Later teaching sessions read the graph to build on what you know. Practice sessions draw their material from it. The graph stores ideas and their connections. Your learner state lives apart from it.

Keeping knowledge in memory over months (spaced review) is the next phase of work. See [`docs/kvasir/ROADMAP.md`](docs/kvasir/ROADMAP.md).

![Kvasir knowledge graph](docs/assets/knowledge-graph.png)

## Build and run

Kvasir has no published download yet. Build it from source with Node.js:

```bash
npm ci
npm run desktop:dev   # Next.js dev server plus the Electron shell
```

Add your provider API key and choose your models, then start a session with what you want to understand. Kvasir supports 30+ provider options, including OpenAI, Anthropic, Google, DeepSeek and OpenRouter. Dictation and web search are optional and use separate service keys.

**Dictation:** create a [Deepgram API key](https://console.deepgram.com/) with the **Member role or higher** ([required for token minting](https://developers.deepgram.com/reference/auth/tokens/grant)) and add it under **Settings → Providers → Dictation**. Choose the language below the key. **Multilingual** recognises languages automatically, including mixed-language speech. A `403 Insufficient permissions` error during token minting usually means the key role is too low.

## Your keys, your data

- **Your keys and models.** You pay your providers directly for usage. A live cost meter shows model costs.
- **Local storage.** Chats, the graph, settings and API keys stay on your machine, in `~/Library/Application Support/Kvasir` on macOS. Learning records are plain files you can inspect.
- **External services.** Models run through the providers you configure. Each model request sends the context the task needs. Web research and dictation also contact external services, so local storage still involves online processing.
- **Inspectable behaviour.** System prompts are visible and editable in the app.

## Development

```bash
npm ci
npm run dev        # http://localhost:3000
npm test           # deterministic, no LLM, no network
```

See the [development guide](docs/development.md), the [architecture](docs/architecture.md) and the [Kvasir build docs](docs/kvasir/). Bugs and tasks are tracked in [GitHub Issues](https://github.com/Bharambe-NL/kvasir/issues).

## Based on LearnHarness

Kvasir is a modified version of [LearnHarness](https://github.com/amosblomqvist/learnharness) by Amos Blomqvist. It began as a clean import of upstream commit `dc4c398` (version 0.4.0) with fresh history, and it does not track upstream. Upstream copyright notices are kept. [`docs/kvasir/LINEAGE.md`](docs/kvasir/LINEAGE.md) records the origin, the licence obligations and every fix ported by hand.

## Licence

[AGPL-3.0-only](LICENSE), the same licence as the upstream project.
