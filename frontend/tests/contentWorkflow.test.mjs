import assert from 'node:assert/strict';
import test from 'node:test';
import { contentWorkTaskStatuses, workflowDependencyIds, workflowDependenciesSatisfied, nextDependentWorkflowStage, workflowHasDependencyCycle } from '../src/utils/contentWorkflow.ts';

const stage = (id, status, extra = {}) => ({
  id, title: id, stageKey: id, departmentId: 'd1', order: Number(id.replace(/\D/g, '')) || 0,
  status, inputs: [], outputs: [], ...extra,
});

test('explicit multi-stage dependencies must all be complete or handed off to unlock', () => {
  const first = stage('s1', 'pending_approval', { outputs: [{ id: 'out-1', name: 'draft', type: 'file', isRequired: true, isDelivered: true }] });
  const second = stage('s2', 'completed');
  const target = stage('s3', 'pending_dependency', { dependsOnStageIds: ['s1', 's2'] });
  const stages = [first, second, target];

  assert.deepEqual(workflowDependencyIds(target, 2, stages), ['s1', 's2']);
  assert.equal(workflowDependenciesSatisfied(target, 2, stages), false);
  first.outputs[0].forwardedToStageId = 's3';
  assert.equal(workflowDependenciesSatisfied(target, 2, stages), true);
});

test('workflow task actions match stage dependencies, review gates, and required outputs', () => {
  const predecessor = stage('s1', 'completed');
  const start = stage('s2', 'not_started', { dependsOnStageIds: ['s1'] });
  const review = stage('s3', 'in_progress', { dependsOnStageIds: [], reviewRequired: true, outputs: [{ id: 'o', name: 'Final', type: 'file', isRequired: true, isDelivered: false }] });
  const direct = stage('s4', 'in_progress', { dependsOnStageIds: [], reviewRequired: false, outputs: [{ id: 'o', name: 'Final', type: 'file', isRequired: true, isDelivered: true }] });
  const stages = [predecessor, start, review, direct];

  assert.deepEqual(contentWorkTaskStatuses(start, 1, stages), ['backlog', 'in_progress']);
  assert.deepEqual(contentWorkTaskStatuses(review, 2, stages), ['in_progress']);
  review.outputs[0].assetId = 'asset-7';
  assert.deepEqual(contentWorkTaskStatuses(review, 2, stages), ['in_progress', 'review']);
  assert.deepEqual(contentWorkTaskStatuses(direct, 3, stages), ['in_progress', 'completed']);
  assert.deepEqual(contentWorkTaskStatuses(stage('blocked', 'pending_dependency', { dependsOnStageIds: ['not-present'] }), 0, stages), []);
});

test('legacy workflows keep their implicit sequential dependency and forwarding target', () => {
  const first = stage('s1', 'in_progress');
  const next = stage('s2', 'pending_dependency');
  const later = stage('s3', 'not_started');
  const stages = [first, next, later];

  assert.deepEqual(workflowDependencyIds(next, 1, stages), ['s1']);
  assert.equal(nextDependentWorkflowStage('s1', stages), next);
  assert.equal(nextDependentWorkflowStage('s2', stages), later);
});

test('dependency graph validation detects cycles without rejecting a valid fan-in graph', () => {
  const valid = [stage('s1', 'completed'), stage('s2', 'completed'), stage('s3', 'not_started', { dependsOnStageIds: ['s1', 's2'] })];
  const cyclic = [stage('s1', 'not_started', { dependsOnStageIds: ['s2'] }), stage('s2', 'not_started', { dependsOnStageIds: ['s1'] })];
  assert.equal(workflowHasDependencyCycle(valid), false);
  assert.equal(workflowHasDependencyCycle(cyclic), true);
});
