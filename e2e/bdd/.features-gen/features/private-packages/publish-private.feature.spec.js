// Generated from: features/private-packages/publish-private.feature
import { test } from '../../../steps/fixtures.ts';

test.describe('Publishing private skills', () => {
  test.beforeEach('Background', async ({ Given, e2eContext }, testInfo) => {
    if (testInfo.error) return;
    await Given('Alice is authenticated with the registry', null, { e2eContext });
  });

  test('Alice publishes a skill as private', { tag: ['@private-packages', '@smoke', '@critical'] }, async ({
    Given,
    When,
    Then,
    And,
    bddState,
    e2eContext
  }) => {
    await Given('Alice has a skill "private-visibility-skill" ready to publish', null, { bddState, e2eContext });
    await When('Alice publishes the skill with private visibility', null, { bddState, e2eContext });
    await Then('the skill should be published successfully', null, { bddState });
    await And('the skill should have "private" visibility in the registry', null, { bddState, e2eContext });
  });

  test('Alice publishes a skill without visibility', { tag: ['@private-packages', '@smoke', '@critical'] }, async ({
    Given,
    When,
    Then,
    And,
    bddState,
    e2eContext
  }) => {
    await Given('Alice has a skill "default-visibility-skill" ready to publish', null, { bddState, e2eContext });
    await When('Alice publishes the skill without specifying visibility', null, { bddState, e2eContext });
    await Then('the skill should be published successfully', null, { bddState });
    await And('the skill should have "public" visibility in the registry', null, { bddState, e2eContext });
  });

  test('Alice publishes with the private flag', { tag: ['@private-packages', '@smoke', '@critical'] }, async ({
    Given,
    When,
    Then,
    And,
    bddState,
    e2eContext
  }) => {
    await Given('Alice has a skill "flag-private-skill" ready to publish', null, { bddState, e2eContext });
    await When('Alice publishes the skill with the private flag', null, { bddState, e2eContext });
    await Then('the skill should be published successfully', null, { bddState });
    await And('the skill should have "private" visibility in the registry', null, { bddState, e2eContext });
  });
});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('features/private-packages/publish-private.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: 'test', box: true }]
});

const bddFileData = [
  // bdd-data-start
  {
    pwTestLine: 10,
    pickleLine: 7,
    tags: ['@private-packages', '@smoke', '@critical'],
    steps: [
      {
        pwStepLine: 7,
        gherkinStepLine: 4,
        keywordType: 'Context',
        textWithKeyword: 'Given Alice is authenticated with the registry',
        isBg: true,
        stepMatchArguments: []
      },
      {
        pwStepLine: 11,
        gherkinStepLine: 8,
        keywordType: 'Context',
        textWithKeyword: 'Given Alice has a skill "private-visibility-skill" ready to publish',
        stepMatchArguments: [
          {
            group: {
              start: 18,
              value: '"private-visibility-skill"',
              children: [
                { start: 19, value: 'private-visibility-skill', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 12,
        gherkinStepLine: 9,
        keywordType: 'Action',
        textWithKeyword: 'When Alice publishes the skill with private visibility',
        stepMatchArguments: []
      },
      {
        pwStepLine: 13,
        gherkinStepLine: 10,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the skill should be published successfully',
        stepMatchArguments: []
      },
      {
        pwStepLine: 14,
        gherkinStepLine: 11,
        keywordType: 'Outcome',
        textWithKeyword: 'And the skill should have "private" visibility in the registry',
        stepMatchArguments: [
          {
            group: {
              start: 22,
              value: '"private"',
              children: [
                { start: 23, value: 'private', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      }
    ]
  },
  {
    pwTestLine: 17,
    pickleLine: 14,
    tags: ['@private-packages', '@smoke', '@critical'],
    steps: [
      {
        pwStepLine: 7,
        gherkinStepLine: 4,
        keywordType: 'Context',
        textWithKeyword: 'Given Alice is authenticated with the registry',
        isBg: true,
        stepMatchArguments: []
      },
      {
        pwStepLine: 18,
        gherkinStepLine: 15,
        keywordType: 'Context',
        textWithKeyword: 'Given Alice has a skill "default-visibility-skill" ready to publish',
        stepMatchArguments: [
          {
            group: {
              start: 18,
              value: '"default-visibility-skill"',
              children: [
                { start: 19, value: 'default-visibility-skill', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 19,
        gherkinStepLine: 16,
        keywordType: 'Action',
        textWithKeyword: 'When Alice publishes the skill without specifying visibility',
        stepMatchArguments: []
      },
      {
        pwStepLine: 20,
        gherkinStepLine: 17,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the skill should be published successfully',
        stepMatchArguments: []
      },
      {
        pwStepLine: 21,
        gherkinStepLine: 18,
        keywordType: 'Outcome',
        textWithKeyword: 'And the skill should have "public" visibility in the registry',
        stepMatchArguments: [
          {
            group: {
              start: 22,
              value: '"public"',
              children: [{ start: 23, value: 'public', children: [{ children: [] }] }, { children: [{ children: [] }] }]
            },
            parameterTypeName: 'string'
          }
        ]
      }
    ]
  },
  {
    pwTestLine: 24,
    pickleLine: 21,
    tags: ['@private-packages', '@smoke', '@critical'],
    steps: [
      {
        pwStepLine: 7,
        gherkinStepLine: 4,
        keywordType: 'Context',
        textWithKeyword: 'Given Alice is authenticated with the registry',
        isBg: true,
        stepMatchArguments: []
      },
      {
        pwStepLine: 25,
        gherkinStepLine: 22,
        keywordType: 'Context',
        textWithKeyword: 'Given Alice has a skill "flag-private-skill" ready to publish',
        stepMatchArguments: [
          {
            group: {
              start: 18,
              value: '"flag-private-skill"',
              children: [
                { start: 19, value: 'flag-private-skill', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 26,
        gherkinStepLine: 23,
        keywordType: 'Action',
        textWithKeyword: 'When Alice publishes the skill with the private flag',
        stepMatchArguments: []
      },
      {
        pwStepLine: 27,
        gherkinStepLine: 24,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the skill should be published successfully',
        stepMatchArguments: []
      },
      {
        pwStepLine: 28,
        gherkinStepLine: 25,
        keywordType: 'Outcome',
        textWithKeyword: 'And the skill should have "private" visibility in the registry',
        stepMatchArguments: [
          {
            group: {
              start: 22,
              value: '"private"',
              children: [
                { start: 23, value: 'private', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      }
    ]
  }
]; // bdd-data-end
