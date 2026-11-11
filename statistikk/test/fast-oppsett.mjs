// A fixed game list for the tests, so they keep meaning the same when the site gets a new game
// or a new daily puzzle. (test/oppsett.test.mjs is the one that checks the real list.)
export const OPPSETT = {
  SPILL: { ordugla: "Ordugla", blyanten: "Blyanten", tallknuseren: "Tallknuseren", sauen: "Sauen", luringen: "Luringen" },
  DAGLIGE: ["ordugla", "blyanten", "tallknuseren"],
};
