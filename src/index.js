// @ts-ignore
import { Conduit } from 'socket:conduit'
import { Buffer } from 'socket:buffer'
import { rand64 } from 'socket:crypto'

const id = rand64()
const conduit = new Conduit({ id })

globalThis.addEventListener('message', (e) => {
  conduit.send({ to: e.data.id }, Buffer.from(JSON.stringify({ message: 'hello world' })))
  console.log(e.data)
})

globalThis.navigator.serviceWorker.register('/worker.js')
