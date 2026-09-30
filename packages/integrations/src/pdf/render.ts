// The real renderer lives behind its own entry so packages that only need the types (core, jobs)
// never compile JSX or load @react-pdf. The web app imports this one.
export { CertificateDocument, createCertificateRenderer } from './certificate'
