import fs from "node:fs";
import path from "node:path";

// Reads real booth transcripts for scoring. The app's transcripts/ folder holds
// JSONL, one line per utterance: {"t", "who": "sys"|"patient"|"surgeon", "text"},
// named YYYY-MM-DD-<persona>-<session>.jsonl. "sys" lines are timing notes and
// are dropped. Other shapes are still accepted:
//   JSON: [{role|speaker|who, content|text}] or {messages|turns|transcript: [...]}
//   Text: lines starting "Doctor:", "User:", "HCP:" vs "Patient:", "Assistant:", "AI:"
// Anything it cannot parse is passed to the judge as raw text, which still grades fine.
const PATIENT = /^(patient|assistant|ai|avatar|bot|model)$/i;

function normaliseTurns(arr) {
  const turns = arr
    .filter((t) => !/^sys(tem)?$/i.test(String(t.speaker ?? t.role ?? t.who ?? "")))
    .map((t) => {
      const who = String(t.speaker ?? t.role ?? t.who ?? t.from ?? "");
      let text = t.text ?? t.content ?? t.message ?? "";
      if (Array.isArray(text)) text = text.map((b) => b.text ?? "").join("");
      return { speaker: PATIENT.test(who) ? "patient" : "doctor", text: String(text).trim() };
    })
    .filter((t) => t.text);
  return turns.length ? turns : null;
}

function parseText(raw) {
  const turns = [];
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*\[?([A-Za-z ]{2,20})\]?\s*:\s*(.*)$/);
    if (m) turns.push({ speaker: PATIENT.test(m[1].trim()) ? "patient" : "doctor", text: m[2].trim() });
    else if (turns.length && line.trim()) turns[turns.length - 1].text += " " + line.trim();
  }
  return turns.some((t) => t.speaker === "patient") ? turns : null;
}

export function loadTranscripts(dir) {
  const abs = path.resolve(dir);
  const files = fs.statSync(abs).isDirectory()
    ? fs.readdirSync(abs).filter((f) => /\.(jsonl|json|txt|md|log)$/i.test(f)).sort().map((f) => path.join(abs, f))
    : [abs];
  return files.map((file) => {
    const raw = fs.readFileSync(file, "utf8");
    let turns = null;
    if (file.endsWith(".jsonl")) {
      const lines = raw.split(/\r?\n/).filter((l) => l.trim());
      const arr = [];
      for (const l of lines) {
        try {
          arr.push(JSON.parse(l));
        } catch {}
      }
      turns = normaliseTurns(arr);
    } else if (file.endsWith(".json")) {
      try {
        const data = JSON.parse(raw);
        const arr = Array.isArray(data) ? data : data.messages ?? data.turns ?? data.transcript;
        if (Array.isArray(arr)) turns = normaliseTurns(arr);
      } catch {}
    } else {
      turns = parseText(raw);
    }
    return { id: path.basename(file), file, turns, raw };
  });
}
