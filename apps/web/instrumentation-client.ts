import { listenForClientErrors } from './lib/report-client-error'

// Runs before hydration. Only attaches error listeners; Sentry itself loads on the first error.
listenForClientErrors()
