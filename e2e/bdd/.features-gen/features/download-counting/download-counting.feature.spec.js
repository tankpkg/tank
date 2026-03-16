// Generated from: features/download-counting/download-counting.feature
import { test } from '../../../steps/fixtures.ts';

test.describe('Weekly download counting', () => {
  test.beforeEach('Background', async ({ Given, e2eContext, publishedPublicSkill }, testInfo) => {
    if (testInfo.error) return;
    await Given('a published skill exists in the registry', null, { e2eContext, publishedPublicSkill });
  });

  test('Fetching version metadata records a download', { tag: ['@download-counting', '@smoke', '@critical'] }, async ({
    Given,
    When,
    Then,
    bddState,
    e2eContext,
    publishedPublicSkill
  }) => {
    await Given('the skill has no prior downloads today', null, { e2eContext, publishedPublicSkill });
    await When('the version metadata endpoint is fetched', null, { bddState, e2eContext, publishedPublicSkill });
    await Then('the daily download count for today should be 1', null, { e2eContext, publishedPublicSkill });
  });

  test('Multiple fetches accumulate without deduplication', { tag: ['@download-counting', '@smoke'] }, async ({
    Given,
    When,
    Then,
    bddState,
    e2eContext,
    publishedPublicSkill
  }) => {
    await Given('the skill has no prior downloads today', null, { e2eContext, publishedPublicSkill });
    await When('the version metadata endpoint is fetched 3 times', null, {
      bddState,
      e2eContext,
      publishedPublicSkill
    });
    await Then('the daily download count for today should be 3', null, { e2eContext, publishedPublicSkill });
  });

  test('Downloads aggregate into a single daily row', { tag: ['@download-counting', '@smoke'] }, async ({
    Given,
    When,
    Then,
    bddState,
    e2eContext,
    publishedPublicSkill
  }) => {
    await Given('the skill has no prior downloads today', null, { e2eContext, publishedPublicSkill });
    await When('the version metadata endpoint is fetched 5 times', null, {
      bddState,
      e2eContext,
      publishedPublicSkill
    });
    await Then('only one download row exists for today', null, { e2eContext, publishedPublicSkill });
  });

  test('Download count appears in version metadata response', { tag: ['@download-counting'] }, async ({
    Given,
    When,
    Then,
    bddState,
    e2eContext,
    publishedPublicSkill
  }) => {
    await Given('the skill has 10 recorded downloads for today', null, { e2eContext, publishedPublicSkill });
    await When('the version metadata endpoint is fetched', null, { bddState, e2eContext, publishedPublicSkill });
    await Then('the response should include a downloads field of at least 10', null, { bddState });
  });
});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('features/download-counting/download-counting.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: 'test', box: true }]
});

const bddFileData = [
  // bdd-data-start
  {
    pwTestLine: 10,
    pickleLine: 11,
    tags: ['@download-counting', '@smoke', '@critical'],
    steps: [
      {
        pwStepLine: 7,
        gherkinStepLine: 8,
        keywordType: 'Context',
        textWithKeyword: 'Given a published skill exists in the registry',
        isBg: true,
        stepMatchArguments: []
      },
      {
        pwStepLine: 11,
        gherkinStepLine: 12,
        keywordType: 'Context',
        textWithKeyword: 'Given the skill has no prior downloads today',
        stepMatchArguments: []
      },
      {
        pwStepLine: 12,
        gherkinStepLine: 13,
        keywordType: 'Action',
        textWithKeyword: 'When the version metadata endpoint is fetched',
        stepMatchArguments: []
      },
      {
        pwStepLine: 13,
        gherkinStepLine: 14,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the daily download count for today should be 1',
        stepMatchArguments: [{ group: { start: 45, value: '1', children: [] }, parameterTypeName: 'int' }]
      }
    ]
  },
  {
    pwTestLine: 16,
    pickleLine: 17,
    tags: ['@download-counting', '@smoke'],
    steps: [
      {
        pwStepLine: 7,
        gherkinStepLine: 8,
        keywordType: 'Context',
        textWithKeyword: 'Given a published skill exists in the registry',
        isBg: true,
        stepMatchArguments: []
      },
      {
        pwStepLine: 17,
        gherkinStepLine: 18,
        keywordType: 'Context',
        textWithKeyword: 'Given the skill has no prior downloads today',
        stepMatchArguments: []
      },
      {
        pwStepLine: 18,
        gherkinStepLine: 19,
        keywordType: 'Action',
        textWithKeyword: 'When the version metadata endpoint is fetched 3 times',
        stepMatchArguments: [{ group: { start: 41, value: '3', children: [] }, parameterTypeName: 'int' }]
      },
      {
        pwStepLine: 19,
        gherkinStepLine: 20,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the daily download count for today should be 3',
        stepMatchArguments: [{ group: { start: 45, value: '3', children: [] }, parameterTypeName: 'int' }]
      }
    ]
  },
  {
    pwTestLine: 22,
    pickleLine: 23,
    tags: ['@download-counting', '@smoke'],
    steps: [
      {
        pwStepLine: 7,
        gherkinStepLine: 8,
        keywordType: 'Context',
        textWithKeyword: 'Given a published skill exists in the registry',
        isBg: true,
        stepMatchArguments: []
      },
      {
        pwStepLine: 23,
        gherkinStepLine: 24,
        keywordType: 'Context',
        textWithKeyword: 'Given the skill has no prior downloads today',
        stepMatchArguments: []
      },
      {
        pwStepLine: 24,
        gherkinStepLine: 25,
        keywordType: 'Action',
        textWithKeyword: 'When the version metadata endpoint is fetched 5 times',
        stepMatchArguments: [{ group: { start: 41, value: '5', children: [] }, parameterTypeName: 'int' }]
      },
      {
        pwStepLine: 25,
        gherkinStepLine: 26,
        keywordType: 'Outcome',
        textWithKeyword: 'Then only one download row exists for today',
        stepMatchArguments: []
      }
    ]
  },
  {
    pwTestLine: 28,
    pickleLine: 28,
    tags: ['@download-counting'],
    steps: [
      {
        pwStepLine: 7,
        gherkinStepLine: 8,
        keywordType: 'Context',
        textWithKeyword: 'Given a published skill exists in the registry',
        isBg: true,
        stepMatchArguments: []
      },
      {
        pwStepLine: 29,
        gherkinStepLine: 29,
        keywordType: 'Context',
        textWithKeyword: 'Given the skill has 10 recorded downloads for today',
        stepMatchArguments: [{ group: { start: 14, value: '10', children: [] }, parameterTypeName: 'int' }]
      },
      {
        pwStepLine: 30,
        gherkinStepLine: 30,
        keywordType: 'Action',
        textWithKeyword: 'When the version metadata endpoint is fetched',
        stepMatchArguments: []
      },
      {
        pwStepLine: 31,
        gherkinStepLine: 31,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the response should include a downloads field of at least 10',
        stepMatchArguments: [{ group: { start: 58, value: '10', children: [] }, parameterTypeName: 'int' }]
      }
    ]
  }
]; // bdd-data-end
