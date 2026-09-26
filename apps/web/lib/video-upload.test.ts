import { createServer, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createVideoUpload } from './video-upload'

// Acceptance (docs/phases/phase-02): an upload survives a network drop and resumes. A minimal
// TUS server cuts the connection partway through the first chunk; the client must retry, ask
// for the offset and finish with every byte intact.

interface Upload {
  length: number
  data: Buffer
}

function tusServer(opts: { dropFirstPatchAfter: number }) {
  const uploads = new Map<string, Upload>()
  let patches = 0
  let dropped = false
  const headers = {
    'Tus-Resumable': '1.0.0',
    'Access-Control-Expose-Headers': 'Upload-Offset, Location',
  }
  const server: Server = createServer((req: IncomingMessage, res) => {
    const id = req.url?.split('/').pop() ?? ''
    if (req.method === 'POST') {
      uploads.set('1', { length: Number(req.headers['upload-length']), data: Buffer.alloc(0) })
      res.writeHead(201, { ...headers, Location: '/files/1' }).end()
      return
    }
    const upload = uploads.get(id)
    if (!upload) {
      res.writeHead(404, headers).end()
      return
    }
    if (req.method === 'HEAD') {
      res
        .writeHead(200, {
          ...headers,
          'Upload-Offset': String(upload.data.length),
          'Upload-Length': String(upload.length),
          'Cache-Control': 'no-store',
        })
        .end()
      return
    }
    if (req.method === 'PATCH') {
      patches++
      const offset = Number(req.headers['upload-offset'])
      if (offset !== upload.data.length) {
        res.writeHead(409, headers).end()
        return
      }
      const chunks: Buffer[] = []
      let received = 0
      req.on('data', (c: Buffer) => {
        received += c.length
        if (!dropped && received >= opts.dropFirstPatchAfter) {
          dropped = true
          // Simulated network drop: keep nothing from this request and cut the socket.
          req.socket.destroy()
          return
        }
        chunks.push(c)
      })
      req.on('end', () => {
        if (req.socket.destroyed) return
        upload.data = Buffer.concat([upload.data, ...chunks])
        res.writeHead(204, { ...headers, 'Upload-Offset': String(upload.data.length) }).end()
      })
    }
  })
  return { server, uploads, patches: () => patches, dropped: () => dropped }
}

let running: Server | undefined
afterEach(() => running?.close())

describe('video upload', () => {
  it('resumes after the connection drops mid-chunk and delivers every byte', async () => {
    const tus = tusServer({ dropFirstPatchAfter: 20_000 })
    running = tus.server
    await new Promise<void>((resolve) => tus.server.listen(0, '127.0.0.1', resolve))
    const port = (tus.server.address() as AddressInfo).port
    const video = Buffer.from(Array.from({ length: 200_000 }, (_, i) => i % 251))

    let progress = 0
    await new Promise<void>((resolve, reject) => {
      createVideoUpload(
        video,
        {
          endpoint: `http://127.0.0.1:${port}/files`,
          headers: {
            AuthorizationSignature: 'sig',
            AuthorizationExpire: '1',
            VideoId: 'v',
            LibraryId: 'l',
          },
        },
        { filetype: 'video/mp4', title: 'Welcome' },
        {
          onProgress: (sent) => {
            progress = sent
          },
          onError: reject,
          onSuccess: () => resolve(),
        },
        { chunkSize: 64 * 1024, retryDelays: [0, 20, 50] },
      ).start()
    })

    expect(tus.dropped()).toBe(true)
    expect(tus.patches()).toBeGreaterThan(Math.ceil(video.length / (64 * 1024)))
    expect(tus.uploads.get('1')?.data.equals(video)).toBe(true)
    expect(progress).toBe(video.length)
  })
})
