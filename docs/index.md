---
title: Quartermaster
layout: landing
description: A scheduled AI agent framework for repository maintenance.
---

# Quartermaster

<h3 class="tagline text-light">A scheduled AI agent framework for repository maintenance.</h3>

<div class="hstack">
  <a href="guide/quickstart/" class="button">Get started</a>
  <a href="https://github.com/oddship/quartermaster" class="button outline">GitHub</a>
</div>

<br>

<div class="features">
<article class="card">
<header><h3>Mission-based</h3></header>

Pluggable maintenance tasks that run on a schedule. Dependency updates ships first. Security audits, license compliance, and more to come.
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
