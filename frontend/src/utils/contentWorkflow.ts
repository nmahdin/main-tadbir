import type { ContentStage, TaskStatus } from '../types';

const FINISHED_STAGE_STATUSES = new Set(['approved', 'completed', 'skipped']);

/** Explicit edges win. Older sequential workflows are interpreted as depending on the previous row. */
export function workflowDependencyIds(stage: ContentStage, index: number, stages: ContentStage[]): string[] {
  if (Array.isArray(stage.dependsOnStageIds)) {
    return [...new Set(stage.dependsOnStageIds.map(String).filter(Boolean))];
  }
  const previousId = index > 0 ? stages[index - 1]?.id : undefined;
  return previousId ? [previousId] : [];
}

/** A dependency is satisfied by completion, or by an output explicitly handed to this stage. */
export function workflowDependenciesSatisfied(stage: ContentStage, index: number, stages: ContentStage[]): boolean {
  return workflowDependencyIds(stage, index, stages).every(dependencyId => {
    const dependency = stages.find(candidate => candidate.id === dependencyId);
    if (!dependency) return false;
    return FINISHED_STAGE_STATUSES.has(dependency.status)
      || (dependency.outputs || []).some(output => output.forwardedToStageId === stage.id);
  });
}

/** Mirror the server's allowed content-work task actions so the UI never offers generic Kanban/status transitions. */
export function contentWorkTaskStatuses(stage: ContentStage, index: number, stages: ContentStage[]): TaskStatus[] {
  if (FINISHED_STAGE_STATUSES.has(stage.status) || !workflowDependenciesSatisfied(stage, index, stages)) return [];
  const outputsComplete = (stage.outputs || []).every(output => !output.isRequired
    || output.isDelivered === true
    || [output.value, output.url, output.assetId, output.fileName].some(value => !!value));

  switch (stage.status) {
    case 'pending_dependency': return [];
    case 'ready':
    case 'not_started': return ['backlog', 'in_progress'];
    case 'in_progress':
    case 'needs_revision':
    case 'revisions_needed':
      return stage.reviewRequired === false
        ? outputsComplete ? ['in_progress', 'completed'] : ['in_progress']
        : outputsComplete ? ['in_progress', 'review'] : ['in_progress'];
    case 'ready_for_review':
    case 'pending_approval': return ['review'];
    default: return [];
  }
}

/** Return the first unfinished stage which explicitly (or, for legacy data, implicitly) depends on this stage. */
export function nextDependentWorkflowStage(sourceStageId: string, stages: ContentStage[]): ContentStage | undefined {
  return stages
    .map((stage, index) => ({ stage, index }))
    .filter(({ stage, index }) => workflowDependencyIds(stage, index, stages).includes(sourceStageId)
      && !FINISHED_STAGE_STATUSES.has(stage.status))
    .sort((left, right) => (left.stage.order ?? left.index) - (right.stage.order ?? right.index)
      || left.index - right.index)[0]?.stage;
}

export function workflowHasDependencyCycle(stages: ContentStage[]): boolean {
  const byId = new Map(stages.map((stage, index) => [stage.id, workflowDependencyIds(stage, index, stages)]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (stageId: string): boolean => {
    if (visiting.has(stageId)) return true;
    if (visited.has(stageId)) return false;
    visiting.add(stageId);
    for (const dependencyId of byId.get(stageId) || []) {
      if (byId.has(dependencyId) && visit(dependencyId)) return true;
    }
    visiting.delete(stageId);
    visited.add(stageId);
    return false;
  };

  for (const stageId of byId.keys()) {
    if (visit(stageId)) return true;
  }
  return false;
}

export function workflowStageIsFinished(stage: ContentStage): boolean {
  return FINISHED_STAGE_STATUSES.has(stage.status);
}
