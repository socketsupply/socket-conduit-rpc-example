const decoder = new TextDecoder()
const encoder = new TextEncoder()

export function id () {
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]
}

/**
 * @param {{ origin: string | URL, key: string }} options
 * @param {(function(Error|null):any)?} [callback]
 * @return {WebSocket & { id: number }}
 */
export function connect (options, callback = null) {
  const socketId = id()
  const url = new URL(`/${socketId}/0?key=${options.key}`, options.origin)
  const socket = Object.assign(new WebSocket(url.href), {
    id: socketId
  })

  if (typeof callback === 'function') {
    socket.addEventListener('error', (e) => callback(/** @type {ErrorEvent} */ (e).error))
    socket.addEventListener('open', () => callback(null))
  }

  return socket
}

/**
 * @see {@link https://github.com/socketsupply/socket/blob/master/api/conduit.js}
 * @param {string} key
 * @param {string} value
 * @return {Uint8Array}
 */
export function encodeOption (key, value) {
  const keyLength = key.length
  const keyBuffer = encoder.encode(key)

  const valueBuffer = encoder.encode(value)
  const valueLength = valueBuffer.length

  const buffer = new ArrayBuffer(1 + keyLength + 2 + valueLength)
  const view = new DataView(buffer)

  view.setUint8(0, keyLength)
  new Uint8Array(buffer, 1, keyLength).set(keyBuffer)

  view.setUint16(1 + keyLength, valueLength, false)
  new Uint8Array(buffer, 3 + keyLength, valueLength).set(valueBuffer)

  return new Uint8Array(buffer)
}

/**
 * @param {Record<string, string|number|boolean>} options
 * @param {Uint8Array} payload
 * @return {Uint8Array}
 */
export function encodeMessage (options, payload) {
  const headerBuffers = Object.entries(options)
    .map(([key, value]) => encodeOption(key, String(value)))

  const totalOptionLength = headerBuffers.reduce((sum, buf) => sum + buf.length, 0)
  const bodyLength = payload.length
  const buffer = new ArrayBuffer(1 + totalOptionLength + 2 + bodyLength)
  const view = new DataView(buffer)

  view.setUint8(0, headerBuffers.length)

  let offset = 1

  headerBuffers.forEach(headerBuffer => {
    new Uint8Array(buffer, offset, headerBuffer.length).set(headerBuffer)
    offset += headerBuffer.length
  })

  view.setUint16(offset, bodyLength, false)
  offset += 2

  new Uint8Array(buffer, offset, bodyLength).set(payload)

  return new Uint8Array(buffer)
}

/**
 * @param {Uint8Array} data
 * @return {{ options: Record<string, string|number|boolean>, payload: Uint8Array }}
 */
export function decodeMessage (data) {
  const view = new DataView(data.buffer)
  const numOpts = view.getUint8(0)

  let offset = 1
  const options = /** @type {Record<string, string|number|boolean>} */ ({})

  for (let i = 0; i < numOpts; i++) {
    const keyLength = view.getUint8(offset)
    offset += 1

    const key = decoder.decode(new Uint8Array(data.buffer, offset, keyLength))
    offset += key.length

    const valueLength = view.getUint16(offset, false)
    offset += 2

    const valueBuffer = new Uint8Array(data.buffer, offset, valueLength)
    offset += valueLength

    const value = decoder.decode(valueBuffer)
    options[key] = value
  }

  const bodyLength = view.getUint16(offset, false)
  offset += 2

  const payload = data.subarray(offset, offset + bodyLength)
  return { options, payload }
}

/**
 * @param {WebSocket} webSocket
 * @param {Record<string, string|number|boolean>} options
 * @param {Uint8Array=} [payload]
 */
export function send (webSocket, options, payload = null) {
  if (!payload) {
    payload = new Uint8Array(0)
  }

  return webSocket.send(encodeMessage(options, payload))
}

/**
 * @param {WebSocket} webSocket
 * @param {function(Error|null, { options: Record<string, string|number|boolean>, payload: Uint8Array }?):any} callback
 */
export function receive (webSocket, callback) {
  webSocket.addEventListener('error', onerror)
  webSocket.addEventListener('message', onmessage)

  return cleanup

  function cleanup () {
    webSocket.removeEventListener('error', onerror)
    webSocket.removeEventListener('message', onmessage)
  }

  function onerror (event) {
    // @ts-ignore
    callback(event.error || new Error())
  }

  async function onmessage (event) {
    let decoded
    try {
      // @ts-ignore
      const data = new Uint8Array(await event.data?.arrayBuffer?.() ?? 0)
      decoded = decodeMessage(data)
    } catch (err) {
      // @ts-ignore
      return callback(err)
    }

    callback(null, decoded)
  }
}

export default {
  id,
  send,
  connect,
  receive
}
