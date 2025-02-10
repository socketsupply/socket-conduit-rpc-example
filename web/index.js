import conduit from './conduit.js'

const decoder = new TextDecoder()
const socket = conduit.connect({ origin: 'ws://localhost:8080', key: 'hello world' }, async (err) => {
  if (err) {
    return globalThis.reportError(err)
  }

  const response = await request('serviceWorker.fetch', { pathname: '/hello.json' })
  globalThis.document.body.innerHTML = `
    <h1>${response.message}</h1>
  `

  await request('window.send', {
    event: 'message',
    value: JSON.stringify({ message: 'hello socket runtime from browser extension', id: socket.id }),
    targetWindowIndex: 0
  })
})

async function request (command, options, payload) {
  return await new Promise((resolve, reject) => {
    const token = Math.random().toString(16).slice(2)
    conduit.send(socket, { route: command, 'ipc-token': token, ...options }, payload)
    const stop = conduit.receive(socket, (err, message) => {
      if (err) {
        globalThis.report(err)
      } else {
        try {
          const result = JSON.parse(decoder.decode(message.payload))
          if (result.token === token || message.options.token === token) {
            stop()
            if (result.err) {
              return reject(new Error(result.err?.message ?? result.err))
            } else {
              return resolve(result.data ?? result)
            }
          }
        } catch (err) {
          globalThis.reportError(err)
        }
      }
    })
  })
}
