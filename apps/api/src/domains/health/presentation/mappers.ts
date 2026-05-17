/**
 * Pure mapping functions: Domain aggregate → HTTP DTO.
 *
 * Per rule 30 mappers live in `presentation/` and are the ONLY place that
 * knows both shapes. Keep them total (every domain field is either copied,
 * transformed, or explicitly dropped) — surprises here are how stale or
 * leaky DTOs creep into production APIs.
 */

import type { DependencyHealth } from '../domain/DependencyHealth.js';
import type { HealthReport } from '../domain/HealthReport.js';
import type { DependencyHealthDto, HealthReportDto } from './dto/HealthReportDto.js';

const toDependencyDto = (dep: DependencyHealth): DependencyHealthDto => ({
  name: dep.name,
  status: dep.status,
  ...(dep.latencyMs !== undefined ? { latencyMs: dep.latencyMs } : {}),
  ...(dep.error !== undefined ? { error: dep.error } : {}),
});

export const toHealthReportDto = (report: HealthReport): HealthReportDto => ({
  status: report.status,
  uptimeSeconds: report.uptimeSeconds,
  checkedAt: report.checkedAt.toISOString(),
  dependencies: report.dependencies.map(toDependencyDto),
});
