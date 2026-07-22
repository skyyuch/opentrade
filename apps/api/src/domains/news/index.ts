/**
 * Public surface of the news domain (ADR-0057).
 *
 * The router crosses the boundary for HTTP; the repository + its port are
 * exported so the news-fetcher task (ingestion) and any future consumer can
 * read without reaching into another domain's internals.
 */

export { newsRouter } from './presentation/routes.js';
export { PrismaNewsRepository } from './infrastructure/PrismaNewsRepository.js';
export { ListNewsUseCase } from './application/ListNewsUseCase.js';
export type { INewsRepository } from './domain/INewsRepository.js';
export type { NewsItemRecord, ListNewsOptions } from './domain/NewsItemEntity.js';
