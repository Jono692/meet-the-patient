// Single source of the character prompt. personas.json is the only place the
// characters are defined; every provider renders the same text.

function buildPrompt(personasFile, p) {
  return [
    personasFile.shared_rules,
    "",
    `YOUR NAME: ${p.name}. AGE: ${p.age}.`,
    `WHO YOU ARE: ${p.story}`,
    "",
    // Alcon wrote a short direction for each patient. It is their instruction
    // on how the character should be played, so it goes in verbatim.
    ...(p.behaviour ? ["HOW TO PLAY THIS PATIENT:", p.behaviour, ""] : []),
    "MUST-SURFACE FACTS (bring these up yourself if the surgeon hasn't found them after a while):",
    ...p.must_surface.map((s) => "- " + s),
    "",
    // Alcon, 30 Oct: the patient tells the surgeon their history out loud. It used to
    // live only on the operator's screen, which is why they could only point at it.
    ...(p.clinical_file
      ? [
          "WHAT YOU WERE TOLD ABOUT YOUR EYES (say this in your own words when asked, never point at a screen):",
          ...Object.entries(p.clinical_file)
            .filter(([k]) => !k.startsWith("_"))
            .map(([k, v]) => `- ${k.replace(/_/g, " ")}: ${v}`),
          "",
        ]
      : []),
    ...(p.priorities
      ? [
          "WHAT MATTERS MOST TO YOU (only if asked - never volunteer this):",
          "- " + p.priorities.spectacle_freedom,
          "- " + p.priorities.forced_choice,
          "",
        ]
      : []),
    `HOW YOU REACT IF THE RECOMMENDATION FITS YOU: ${p.reaction_if_fits}`,
    `HOW YOU REACT IF IT DOESN'T: ${p.reaction_if_clash}`,
  ].join("\n");
}

module.exports = { buildPrompt };
