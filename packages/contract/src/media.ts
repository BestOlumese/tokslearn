import { z } from 'zod'
import { base } from './base'
import { IsoDateTime } from './shared'

/** Purposes enabled so far; more arrive with the features that need them (docs/09 §5). */
export const UploadPurpose = z.enum(['avatar'])

export const mediaContract = {
  createFileUpload: base
    .route({
      method: 'POST',
      path: '/media/uploads',
      tags: ['Media'],
      summary: 'Start a file upload',
      description:
        'Returns a presigned URL valid for 5 minutes. PUT the file there with the returned headers, then call completeFileUpload.',
    })
    .input(
      z.strictObject({
        purpose: UploadPurpose,
        filename: z.string().trim().min(1).max(200),
        mime: z.string().max(100),
        sizeBytes: z.number().int().positive(),
      }),
    )
    .output(
      z.object({
        fileId: z.uuid(),
        uploadUrl: z.url(),
        headers: z.record(z.string(), z.string()),
        expiresAt: IsoDateTime,
      }),
    ),

  completeFileUpload: base
    .route({
      method: 'POST',
      path: '/media/uploads/{fileId}/complete',
      tags: ['Media'],
      summary: 'Finish a file upload',
      description: 'Checks the file arrived with the declared size, then marks it ready to use.',
    })
    .input(z.strictObject({ fileId: z.uuid() }))
    .output(z.object({ fileId: z.uuid(), url: z.string().nullable() })),
}
