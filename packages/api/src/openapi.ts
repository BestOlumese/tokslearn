import { OpenAPIGenerator } from '@orpc/openapi'
import { ZodToJsonSchemaConverter } from '@orpc/zod/zod4'
import { router } from './router'

const generator = new OpenAPIGenerator({ schemaConverters: [new ZodToJsonSchemaConverter()] })

/** OpenAPI document served at /api/v1/openapi.json (docs/04 §2). */
export function generateOpenApiSpec(options: { serverUrl: string; version: string }) {
  return generator.generate(router, {
    info: {
      title: 'Tokslearn API',
      version: options.version,
      description:
        'The same API the Tokslearn web and mobile apps use. Errors carry a stable `data.code`.',
    },
    servers: [{ url: options.serverUrl }],
  })
}
