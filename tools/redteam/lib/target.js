import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { client, trackUsage, textOf } from "./claude.js";

// Loads the persona prompt. Accepts a .txt/.md file, or a JS module
// (e.g. meet-the-patient/providers/prompt.js). For a module, the first of
// these exports that exists is used: default, SYSTEM_PROMPT, systemPrompt,
// PROMPT, prompt, buildPrompt, getPrompt. A function export is called with
// no arguments and may return a string or a Promise of one.
const EXPORT_NAMES = ["default", "SYSTEM_PROMPT", "systemPrompt", "PROMPT", "prompt", "buildPrompt", "getPrompt"];

export async function loadPersonaPrompt(file, persona = "peter") {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`Persona prompt not found: ${abs}`);
  if (!/\.(c|m)?js$/.test(abs)) return fs.readFileSync(abs, "utf8");

  const mod = await import(pathToFileURL(abs).href);

  // Meet the Patient's providers/prompt.js is CommonJS and exports
  // buildPrompt(personasFile, persona), which every avatar provider calls the
  // same way. Render it exactly as the booth does, from ../personas.json.
  const build = mod.buildPrompt ?? mod.default?.buildPrompt;
  if (typeof build === "function" && build.length >= 2) {
    const personasPath = path.join(path.dirname(abs), "..", "personas.json");
    const personasFile = JSON.parse(fs.readFileSync(personasPath, "utf8"));
    const p = personasFile.personas.find((x) => x.id === persona);
    if (!p) throw new Error(`No persona "${persona}" in ${personasPath}. Have: ${personasFile.personas.map((x) => x.id).join(", ")}`);
    return build(personasFile, p);
  }

  const name = EXPORT_NAMES.find((n) => mod[n] !== undefined);
  if (!name) {
    throw new Error(
      `${file} has none of the expected exports (${EXPORT_NAMES.join(", ")}). ` +
        `Found: ${Object.keys(mod).join(", ") || "nothing"}. Export the prompt string, or pass a .txt copy.`,
    );
  }
  let value = mod[name];
  if (typeof value === "function") value = await value();
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Export "${name}" in ${file} did not produce a prompt string.`);
  }
  return value;
}

// The default target sends the persona prompt to Claude. Set TARGET_MODEL
// and TARGET_EFFORT to match production, otherwise the results describe a
// different system from the one at the booth.
export function claudeTarget({ system, model, effort }) {
  return async function reply(messages) {
    const response = await client.messages.create({
      model,
      max_tokens: 4000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
      output_config: { effort },
    });
    trackUsage(model, response.usage);
    if (response.stop_reason === "refusal") return { text: "", refusal: response.stop_details?.category ?? "unknown" };
    return { text: textOf(response) };
  };
}

// A custom target lets you test the real production path instead
// (a different provider, middleware, output filters). The module must export
// `async function reply({ system, messages })` returning a string.
export async function customTarget(file, system) {
  const mod = await import(pathToFileURL(path.resolve(file)).href);
  if (typeof mod.reply !== "function") throw new Error(`${file} must export async function reply({ system, messages })`);
  return async (messages) => ({ text: String(await mod.reply({ system, messages })) });
}
