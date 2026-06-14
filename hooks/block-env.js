#!/usr/bin/env node

// Read the tool call context passed via stdin by Claude Code
const fs = require('fs');
const input = JSON.parse(fs.readFileSync(0, 'utf-8'));

const toolName = input.tool_name || "";
const toolInput = input.tool_input || {};

// 1. Inspect direct file system tools (Read, Grep, Edit)
const filePath = toolInput.path || toolInput.file_path || "";

// 2. Inspect shell tools (Bash) for command tricks (e.g., cat .env)
const command = toolInput.command || "";

if (
  filePath.includes('.env') || 
  command.match(/\.env/)
) {
  console.error("SECURITY BLOCK: Access to .env files is explicitly denied.");
  process.exit(2); // Exit code 2 forces a hard block in Claude Code
}

process.exit(0); // Pass-through safely
