#!/usr/bin/env node
// ---------- claude-wisp.js — npm thin shell: same binary, claude-wisp dispatch token ---------- //

// One compiled binary serves both bins — `wisp claude-wisp …` reaches the launcher (#67).
void require('./wisp.js').run(['claude-wisp']);
