// Web API globals for API-route tests under jsdom.
// jest-environment-jsdom does not expose fetch primitives, but Next.js
// route handlers (NextRequest/NextResponse) require them at import time.
const { TextEncoder, TextDecoder } = require('util')

// Unit/integration tests exercise the current player-flow contract by default.
// Production remains opt-in and must enable this only after migration 037.
if (typeof process.env.NEXT_PUBLIC_FTUE_V2 === 'undefined') {
  process.env.NEXT_PUBLIC_FTUE_V2 = 'true'
}

if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder

const { ReadableStream, WritableStream, TransformStream } = require('stream/web')

if (typeof global.ReadableStream === 'undefined') global.ReadableStream = ReadableStream
if (typeof global.WritableStream === 'undefined') global.WritableStream = WritableStream
if (typeof global.TransformStream === 'undefined') global.TransformStream = TransformStream

const { Blob } = require('buffer')
if (typeof global.Blob === 'undefined') global.Blob = Blob

// jsdom omits Node's immediate scheduler. React 19 otherwise falls back to a
// worker-thread MessageChannel whose listener keeps Jest alive after all tests
// finish. Restoring the Node primitive gives React its preferred Node path.
const { setImmediate, clearImmediate } = require('timers')
if (typeof global.setImmediate === 'undefined') global.setImmediate = setImmediate
if (typeof global.clearImmediate === 'undefined') global.clearImmediate = clearImmediate

const { MessagePort, MessageChannel } = require('worker_threads')
if (typeof global.MessagePort === 'undefined') global.MessagePort = MessagePort
if (typeof global.MessageChannel === 'undefined') global.MessageChannel = MessageChannel

// Supabase opens a BroadcastChannel for browser session synchronization. A
// worker-thread BroadcastChannel is not a browser-faithful polyfill because it
// keeps the Jest process alive. Tests run in one tab, so a no-op channel is the
// correct boundary and still exercises the client initialization path.
class TestBroadcastChannel {
  constructor(name) {
    this.name = name
  }

  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  close() {}
}

global.BroadcastChannel = TestBroadcastChannel

const { fetch, Request, Response, Headers, FormData } = require('undici')

if (typeof global.fetch === 'undefined') global.fetch = fetch
if (typeof global.Request === 'undefined') global.Request = Request
if (typeof global.Response === 'undefined') global.Response = Response
if (typeof global.Headers === 'undefined') global.Headers = Headers
if (typeof global.FormData === 'undefined') global.FormData = FormData
