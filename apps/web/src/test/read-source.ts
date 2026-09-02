/**
 * Source-reading helpers shared by the invariant tests.
 *
 * Several suites assert things of the form "this concept appears NOWHERE" — no rate
 * column, no VITE_-prefixed token, no write to a remote, no composite health score. Run
 * against the raw file those assertions fail on the PROSE THAT EXPLAINS THE ABSENCE,
 * which quietly pressures the codebase into documenting its decisions less. This repo's
 * comments are load-bearing; a test that punishes them is the wrong test.
 *
 * `readCode` strips comments first, so the assertion tests what actually executes and the
 * file stays free to say why it does. `readSource` keeps them, for the assertions that
 * genuinely are about the documentation — "the migration must SAY it is not billing" is a
 * real requirement, because an absence with no stated reason is indistinguishable from an
 * omission somebody will helpfully fix later.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const monorepoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

/** The file exactly as written, comments included. */
export function readSource(path: string): string {
  return readFileSync(join(monorepoRoot, path), "utf-8");
}

/**
 * The file with comments removed — block, line, and SQL.
 *
 * A blunt regex, not a parser. It can be fooled by a comment marker inside a string
 * literal, which would only ever cause a FALSE PASS on a "must not contain" assertion,
 * never a false failure. Given the alternative is adding a TypeScript parser to the test
 * suite, that trade is the right one; if a false pass ever matters, the assertion should
 * be about behaviour instead of source text.
 */
export function readCode(path: string): string {
  return readSource(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*--.*$/gm, "");
}
