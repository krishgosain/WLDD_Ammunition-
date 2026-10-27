/**
 * Probe, on the preview branch only.
 *
 * The gate fails with MIDDLEWARE_INVOCATION_FAILED and writes no log line at
 * all, which means it never reaches my code — it dies at module load. This
 * strips the file to the smallest thing Vercel's docs say should work: no
 * imports, no config beyond the runtime, one hard-coded response.
 *
 * If this answers, middleware works for this project and the fault is in what
 * the real gate imports. If it 500s, middleware itself is the wrong mechanism
 * here and the gate needs a different shape entirely.
 */
export default function middleware() {
  return new Response('gate probe: middleware ran', {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  });
}
