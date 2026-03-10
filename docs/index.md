---
title: Quartermaster
layout: landing
description: An AI agent that keeps your dependencies up to date.
---

# Quartermaster

<h3 class="tagline text-light">An AI agent that keeps your dependencies up to date.</h3>

<div class="hstack">
  <a href="guide/quickstart/" class="button">Get started</a>
  <a href="https://github.com/oddship/quartermaster" class="button outline">GitHub</a>
</div>

<br>

<div class="features">
<article class="card">
<header><h3>Intelligent scanning</h3></header>

An AI agent explores your repo, understands the build system, and finds outdated dependencies. It groups updates intelligently - patch bumps batched, major versions flagged as issues.
</article>

<article class="card">
<header><h3>Safe by design</h3></header>

The agent is read-only. It produces a typed JSON plan that a deterministic executor validates and runs. Only whitelisted commands are allowed. Dry-run by default.
</article>

<article class="card">
<header><h3>Works everywhere</h3></header>

GitLab CI, GitHub Actions, or run locally. Supports Go, Node.js, Python, Rust, and Ruby. Monorepo-aware with per-submodule updates.
</article>

<article class="card">
<header><h3>Any LLM</h3></header>

Bring your own model. Works with Claude (Anthropic, Bedrock), Gemini, GPT, Groq, and more via the Pi SDK.
</article>
</div>
