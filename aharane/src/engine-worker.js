// Runs one Engine in a dedicated worker thread. The main thread owns
// concurrency, cancellation and the hard timeout, and can terminate this worker.
import { parentPort, workerData } from 'node:worker_threads'
import { EngineExecutionError, executeCustomEngineInline } from './engine-runtime.js'

const unlimited = { acquire: async () => () => {} }

try {
  const { engine, inputValues } = workerData
  const result = await executeCustomEngineInline(engine, inputValues, { limiter: unlimited })
  parentPort.postMessage({ ok: true, result })
} catch (error) {
  if (error instanceof EngineExecutionError) {
    parentPort.postMessage({
      ok: false,
      error: {
        outcome: error.outcome,
        message: error.message,
        denials: error.denials || [],
      },
    })
  } else {
    parentPort.postMessage({
      ok: false,
      error: {
        outcome: 'infrastructure',
        message: 'The Engine sandbox failed unexpectedly.',
        denials: [],
      },
    })
  }
}
