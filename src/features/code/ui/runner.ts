/**
 * Browser-side test harness for coding problems.
 *
 * User code runs in a Web Worker, never on the server. That is the whole
 * security argument: a worker has no filesystem, no network credentials, and
 * no access to the page's DOM or cookies, and it can be terminated on a
 * timeout — so an infinite loop costs one worker, not the tab.
 *
 * The worker is built from a Blob URL so there is no separate bundled entry
 * point to keep in sync.
 */

export interface TestCase {
  name: string;
  /** Positional arguments for the entry function. */
  input: unknown[];
  expected: unknown;
}

export interface TestResult {
  name: string;
  passed: boolean;
  expected: unknown;
  actual: unknown;
  error: string | null;
  ms: number;
}

export interface RunOutcome {
  results: TestResult[];
  passed: number;
  total: number;
  compileError: string | null;
  timedOut: boolean;
}

export const RUN_TIMEOUT_MS = 4000;

/** Entry point is the first function the starter code declares. */
export function detectEntryPoint(source: string): string | null {
  const match =
    source.match(/export\s+(?:default\s+)?function\s+([A-Za-z_$][\w$]*)/) ??
    source.match(/function\s+([A-Za-z_$][\w$]*)/) ??
    source.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/);
  return match?.[1] ?? null;
}

const WORKER_SOURCE = String.raw`
self.onmessage = async (event) => {
  const { code, entry, tests } = event.data;

  // Strip TypeScript-only syntax and module keywords. This is a teaching
  // harness, not a compiler: it handles the shapes our starter code uses
  // (type annotations, "export", "import type") rather than the whole language.
  const stripped = code
    .replace(/^\s*import\s+type\s[^\n]*$/gm, "")
    .replace(/^\s*type\s+\w+[^\n]*=[^\n]*$/gm, "")
    .replace(/\bexport\s+default\s+/g, "")
    .replace(/\bexport\s+/g, "")
    .replace(/:\s*[A-Za-z_$][\w$<>\[\]|,\s.'"{}()]*(?=\s*[,)=;{])/g, "");

  let fn;
  try {
    const factory = new Function(stripped + "\nreturn typeof " + entry + " === 'function' ? " + entry + " : undefined;");
    fn = factory();
  } catch (error) {
    self.postMessage({ type: "compile_error", message: String(error && error.message ? error.message : error) });
    return;
  }

  if (typeof fn !== "function") {
    self.postMessage({ type: "compile_error", message: "Could not find a function named '" + entry + "'." });
    return;
  }

  const results = [];
  for (const test of tests) {
    const started = Date.now();
    try {
      // Pad missing arguments with a no-op function so a callback parameter
      // the test data cannot express (JSON has no functions) doesn't blow up.
      const args = Array.isArray(test.input) ? test.input.slice() : [test.input];
      while (args.length < fn.length) args.push(function () {});

      const actual = await fn.apply(null, args);
      results.push({
        name: test.name,
        passed: JSON.stringify(actual) === JSON.stringify(test.expected),
        expected: test.expected,
        actual: actual === undefined ? null : actual,
        error: null,
        ms: Date.now() - started,
      });
    } catch (error) {
      results.push({
        name: test.name,
        passed: false,
        expected: test.expected,
        actual: null,
        error: String(error && error.message ? error.message : error),
        ms: Date.now() - started,
      });
    }
  }

  self.postMessage({ type: "results", results });
};
`;

export async function runTests(
  code: string,
  entry: string,
  tests: readonly TestCase[],
): Promise<RunOutcome> {
  const blob = new Blob([WORKER_SOURCE], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);

  const fail = (partial: Partial<RunOutcome>): RunOutcome => ({
    results: [],
    passed: 0,
    total: tests.length,
    compileError: null,
    timedOut: false,
    ...partial,
  });

  try {
    return await new Promise<RunOutcome>((resolve) => {
      const timer = setTimeout(() => {
        worker.terminate();
        resolve(fail({ timedOut: true }));
      }, RUN_TIMEOUT_MS);

      worker.onmessage = (event: MessageEvent) => {
        clearTimeout(timer);
        const data = event.data as
          | { type: "compile_error"; message: string }
          | { type: "results"; results: TestResult[] };

        if (data.type === "compile_error") {
          resolve(fail({ compileError: data.message }));
          return;
        }

        resolve({
          results: data.results,
          passed: data.results.filter((r) => r.passed).length,
          total: data.results.length,
          compileError: null,
          timedOut: false,
        });
      };

      worker.onerror = (event) => {
        clearTimeout(timer);
        resolve(fail({ compileError: event.message || "Worker failed to start" }));
      };

      worker.postMessage({ code, entry, tests });
    });
  } finally {
    worker.terminate();
    URL.revokeObjectURL(url);
  }
}
