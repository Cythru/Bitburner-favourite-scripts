// ╔═══════════════════════════════════════════════════════════╗
// ║  THEMES - Visual color palette system for stock traders  ║
// ║  5 themes that swap ANSI escape codes for the dashboard  ║
// ║  Exports: getTheme(ns), makeColors(theme)                ║
// ╚═══════════════════════════════════════════════════════════╝

// ANSI color code map per theme.
// Each key maps to an ANSI SGR parameter number:
//   pos  = profit/positive values (green-ish)
//   neg  = loss/negative values (red-ish)
//   acc  = accent color for labels and highlights
//   hl   = secondary highlight (symbols, headers)
//   warn = warnings and caution indicators
//
// Semicolons mean combined codes: "1;92" = bold + bright green.
// These get inserted into escape sequences like: \x1b[32m...\x1b[0m
const themes = {
  classic: { pos: "32",   neg: "31",   acc: "36",   hl: "35",   warn: "33"   },  // green/red/cyan/magenta/yellow
  neon:    { pos: "95",   neg: "93",   acc: "96",   hl: "92",   warn: "91"   },  // bright magenta/yellow/cyan
  matrix:  { pos: "1;92", neg: "2;32", acc: "32",   hl: "92",   warn: "1;33" },  // all-green monochrome, dim losses
  ocean:   { pos: "96",   neg: "91",   acc: "94",   hl: "97",   warn: "93"   },  // cyan/red/blue/white
  fire:    { pos: "1;33", neg: "31",   acc: "91",   hl: "93",   warn: "35"   },  // gold/red/bright red/yellow
};

// Reads the --theme argument from ns.args and returns the matching
// theme object. Falls back to "classic" if not found or not provided.
//
// Returns: { theme: { pos, neg, acc, hl, warn }, name: string }
//
// Usage:
//   const { theme, name } = getTheme(ns);
//   // theme.pos === "32" for classic
//   // name === "classic"
export function getTheme(ns) {
  const idx = ns.args.indexOf("--theme");

  // idx+1 must exist and be truthy (not undefined/null/empty)
  const name = idx >= 0 && ns.args[idx + 1]
    ? String(ns.args[idx + 1]).toLowerCase()
    : "classic";

  // Validate against known themes, fallback to classic
  const matched = themes[name];
  return { theme: matched || themes.classic, name: matched ? name : "classic" };
}

// Builds a color helper object from a theme. Each function wraps
// a string in ANSI escape codes for terminal coloring.
//
// The returned object is typically stored as `C` and used like:
//   C.green("text")  → green colored text
//   C.plcol(val, s)  → green if val >= 0, red if negative
//   C.pct(0.05)      → "+5.00%" in green
//
// How ANSI escape codes work:
//   \x1b[  = "escape sequence introducer" (ESC + [)
//   32m    = "set foreground to green" (SGR parameter)
//   \x1b[0m = "reset all formatting"
//   So \x1b[32mHello\x1b[0m prints "Hello" in green
//
// Pre-building the prefix/suffix strings avoids repeated
// string concatenation in hot paths (dashboard renders every tick).
export function makeColors(th) {
  // Pre-compute escape sequence prefixes for each color.
  // This avoids template literal overhead on every call.
  const posPrefix  = `\x1b[${th.pos}m`;
  const negPrefix  = `\x1b[${th.neg}m`;
  const accPrefix  = `\x1b[${th.acc}m`;
  const hlPrefix   = `\x1b[${th.hl}m`;
  const warnPrefix = `\x1b[${th.warn}m`;
  const reset      = "\x1b[0m";

  return {
    // Basic color wrappers — wrap any string in the theme's color
    green:  (s) => posPrefix + s + reset,
    red:    (s) => negPrefix + s + reset,
    cyan:   (s) => accPrefix + s + reset,
    mag:    (s) => hlPrefix + s + reset,
    yellow: (s) => warnPrefix + s + reset,

    // Text style modifiers (not theme-dependent)
    bold:   (s) => "\x1b[1m" + s + reset,   // heavier weight
    dim:    (s) => "\x1b[2m" + s + reset,    // faded/muted

    // Conditional color: green for positive values, red for negative.
    // Used for P/L displays where the sign determines the color.
    //   v = the numeric value (determines color)
    //   s = the string to colorize (may be formatted differently)
    plcol:  (v, s) => (v >= 0 ? posPrefix : negPrefix) + s + reset,

    // Format a decimal as a percentage with sign and color.
    //   0.05  → "+5.00%" in green
    //   -0.03 → "-3.00%" in red
    pct:    (v) => {
      const str = (v >= 0 ? "+" : "") + (v * 100).toFixed(2) + "%";
      return (v >= 0 ? posPrefix : negPrefix) + str + reset;
    },
  };
}
