import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAnalyticsRecommendations } from '../src/utils/analyticsInsights.ts';

const emptyReport = {
  projects: { total: 0, completed: 0, completionRate: 0 },
  tasks: { total: 0, completed: 0, overdue: 0, completionRate: 0, byStatus: {} },
  contents: { total: 0, published: 0, publishRate: 0, byType: {} },
  ideas: { total: 0, approved: 0, approvalRate: 0, byStatus: {} },
  letters: { total: 0, responded: 0 },
  departments: [],
};

test('analytics recommendations stay empty when no persisted aggregate needs action', () => {
  assert.deepEqual(buildAnalyticsRecommendations(emptyReport), []);
});

test('analytics recommendations use real aggregate counts and sort by priority', () => {
  const recommendations = buildAnalyticsRecommendations({
    ...emptyReport,
    tasks: { ...emptyReport.tasks, overdue: 4 },
    contents: { ...emptyReport.contents, total: 5, published: 2 },
    ideas: { ...emptyReport.ideas, byStatus: { in_review: 2 } },
    letters: { total: 6, responded: 4 },
    departments: [
      { id: 'a', name: 'A', members: 2, activeTasks: 3, workloadIndex: 20 },
      { id: 'b', name: 'B', members: 1, activeTasks: 4, workloadIndex: 65 },
    ],
  });

  assert.deepEqual(recommendations.map(item => item.id), [
    'overdue-tasks', 'ideas-review', 'content-publication', 'unanswered-letters', 'workload-balance',
  ]);
  assert.match(recommendations[0].basis, /۴/);
  assert.match(recommendations[2].basis, /باقی موارد لزوماً آمادهٔ انتشار نیستند/);
  assert.match(recommendations[4].basis, /این شاخص درصد ظرفیت نیست/);
  assert.equal(recommendations[0].priority, 'بالا');
});
