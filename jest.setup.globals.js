// Web API globals for API-route tests under jsdom.
// jest-environment-jsdom does not expose fetch primitives, but Next.js
// route handlers (NextRequest/NextResponse) require them at import time.
const { TextEncoder, TextDecoder } = require('util')

if (typeof global.TextEncoder === 'undefined') global.TextEncoder = TextEncoder
if (typeof global.TextDecoder === 'undefined') global.TextDecoder = TextDecoder

const { ReadableStream, WritableStream, TransformStream } = require('stream/web')

if (typeof global.ReadableStream === 'undefined') global.ReadableStream = ReadableStream
if (typeof global.WritableStream === 'undefined') global.WritableStream = WritableStream
if (typeof global.TransformStream === 'undefined') global.TransformStream = TransformStream

const { Blob } = require('buffer')
if (typeof global.Blob === 'undefined') global.Blob = Blob

const { MessagePort, MessageChannel, BroadcastChannel } = require('worker_threads')
if (typeof global.MessagePort === 'undefined') global.MessagePort = MessagePort
if (typeof global.MessageChannel === 'undefined') global.MessageChannel = MessageChannel
if (typeof global.BroadcastChannel === 'undefined') global.BroadcastChannel = BroadcastChannel

const { fetch, Request, Response, Headers, FormData } = require('undici')

if (typeof global.fetch === 'undefined') global.fetch = fetch
if (typeof global.Request === 'undefined') global.Request = Request
if (typeof global.Response === 'undefined') global.Response = Response
if (typeof global.Headers === 'undefined') global.Headers = Headers
if (typeof global.FormData === 'undefined') global.FormData = FormData
