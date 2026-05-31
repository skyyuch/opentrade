/**
 * Public surface of the notes domain (KOL analyst notes, ADR-0039).
 *
 * Only the router crosses the domain boundary — internals (entity, use cases,
 * repository) stay private to the folder.
 */

export { notesRouter } from './presentation/routes.js';
