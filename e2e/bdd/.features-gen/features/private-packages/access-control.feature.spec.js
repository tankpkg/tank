// Generated from: features/private-packages/access-control.feature
import { test } from '../../../steps/fixtures.ts';

test.describe('Private skill access control', () => {
  test.beforeEach('Background', async ({ Given, bddState, e2eContext, publishedPrivateSkill }, testInfo) => {
    if (testInfo.error) return;
    await Given('Alice has published a private skill "private-access-skill"', null, {
      bddState,
      e2eContext,
      publishedPrivateSkill
    });
  });

  test('Publisher can view their own private skill via tank info', {
    tag: ['@private-packages', '@smoke', '@critical']
  }, async ({ When, Then, bddState, e2eContext, secondUser, thirdUser }) => {
    await When('Alice requests info for "private-access-skill"', null, { bddState, e2eContext, secondUser, thirdUser });
    await Then('Alice should see the skill metadata', null, { bddState });
  });

  test('Org member can view private skill in their org via tank info', {
    tag: ['@private-packages', '@smoke', '@critical']
  }, async ({ Given, When, Then, bddState, e2eContext, secondUser, thirdUser }) => {
    await Given("Bob is an authenticated member of Alice's organization", null, { secondUser });
    await When('Bob requests info for "private-access-skill"', null, { bddState, e2eContext, secondUser, thirdUser });
    await Then('Bob should see the skill metadata', null, { bddState });
  });

  test('Org member can install private skill', { tag: ['@private-packages', '@smoke', '@critical'] }, async ({
    Given,
    When,
    Then,
    bddState,
    e2eContext,
    secondUser,
    thirdUser
  }) => {
    await Given("Bob is an authenticated member of Alice's organization", null, { secondUser });
    await When('Bob tries to install "private-access-skill"', null, { bddState, e2eContext, secondUser, thirdUser });
    await Then('the skill should be installed successfully', null, { bddState });
  });

  test('Unauthenticated user gets not found for private skill via tank info', {
    tag: ['@private-packages', '@smoke', '@critical']
  }, async ({ When, Then, bddState, e2eContext, noAuthHome }) => {
    await When('an unauthenticated user requests info for "private-access-skill"', null, {
      bddState,
      e2eContext,
      noAuthHome
    });
    await Then('the request should return "not found"', null, { bddState });
  });

  test('Non-org member gets not found for private skill via tank info', {
    tag: ['@private-packages', '@smoke', '@critical']
  }, async ({ Given, When, Then, bddState, e2eContext, secondUser, thirdUser }) => {
    await Given("Charlie is authenticated but not in Alice's organization", null, { thirdUser });
    await When('Charlie requests info for "private-access-skill"', null, {
      bddState,
      e2eContext,
      secondUser,
      thirdUser
    });
    await Then('the request should return "not found"', null, { bddState });
  });

  test('Non-org member fails to install private skill', { tag: ['@private-packages', '@smoke', '@critical'] }, async ({
    Given,
    When,
    Then,
    bddState,
    e2eContext,
    secondUser,
    thirdUser
  }) => {
    await Given("Charlie is authenticated but not in Alice's organization", null, { thirdUser });
    await When('Charlie tries to install "private-access-skill"', null, {
      bddState,
      e2eContext,
      secondUser,
      thirdUser
    });
    await Then('the installation should fail with "not found"', null, { bddState });
  });
});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('features/private-packages/access-control.feature'), { scope: 'test', box: true }],
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
        textWithKeyword: 'Given Alice has published a private skill "private-access-skill"',
        isBg: true,
        stepMatchArguments: [
          {
            group: {
              start: 36,
              value: '"private-access-skill"',
              children: [
                { start: 37, value: 'private-access-skill', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 11,
        gherkinStepLine: 8,
        keywordType: 'Action',
        textWithKeyword: 'When Alice requests info for "private-access-skill"',
        stepMatchArguments: [
          { group: { start: 0, value: 'Alice', children: [] }, parameterTypeName: 'word' },
          {
            group: {
              start: 24,
              value: '"private-access-skill"',
              children: [
                { start: 25, value: 'private-access-skill', children: [{ children: [] }] },
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
        keywordType: 'Outcome',
        textWithKeyword: 'Then Alice should see the skill metadata',
        stepMatchArguments: [{ group: { start: 0, value: 'Alice', children: [] }, parameterTypeName: 'word' }]
      }
    ]
  },
  {
    pwTestLine: 15,
    pickleLine: 12,
    tags: ['@private-packages', '@smoke', '@critical'],
    steps: [
      {
        pwStepLine: 7,
        gherkinStepLine: 4,
        keywordType: 'Context',
        textWithKeyword: 'Given Alice has published a private skill "private-access-skill"',
        isBg: true,
        stepMatchArguments: [
          {
            group: {
              start: 36,
              value: '"private-access-skill"',
              children: [
                { start: 37, value: 'private-access-skill', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 16,
        gherkinStepLine: 13,
        keywordType: 'Context',
        textWithKeyword: "Given Bob is an authenticated member of Alice's organization",
        stepMatchArguments: []
      },
      {
        pwStepLine: 17,
        gherkinStepLine: 14,
        keywordType: 'Action',
        textWithKeyword: 'When Bob requests info for "private-access-skill"',
        stepMatchArguments: [
          { group: { start: 0, value: 'Bob', children: [] }, parameterTypeName: 'word' },
          {
            group: {
              start: 22,
              value: '"private-access-skill"',
              children: [
                { start: 23, value: 'private-access-skill', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 18,
        gherkinStepLine: 15,
        keywordType: 'Outcome',
        textWithKeyword: 'Then Bob should see the skill metadata',
        stepMatchArguments: [{ group: { start: 0, value: 'Bob', children: [] }, parameterTypeName: 'word' }]
      }
    ]
  },
  {
    pwTestLine: 21,
    pickleLine: 18,
    tags: ['@private-packages', '@smoke', '@critical'],
    steps: [
      {
        pwStepLine: 7,
        gherkinStepLine: 4,
        keywordType: 'Context',
        textWithKeyword: 'Given Alice has published a private skill "private-access-skill"',
        isBg: true,
        stepMatchArguments: [
          {
            group: {
              start: 36,
              value: '"private-access-skill"',
              children: [
                { start: 37, value: 'private-access-skill', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 22,
        gherkinStepLine: 19,
        keywordType: 'Context',
        textWithKeyword: "Given Bob is an authenticated member of Alice's organization",
        stepMatchArguments: []
      },
      {
        pwStepLine: 23,
        gherkinStepLine: 20,
        keywordType: 'Action',
        textWithKeyword: 'When Bob tries to install "private-access-skill"',
        stepMatchArguments: [
          { group: { start: 0, value: 'Bob', children: [] }, parameterTypeName: 'word' },
          {
            group: {
              start: 21,
              value: '"private-access-skill"',
              children: [
                { start: 22, value: 'private-access-skill', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 24,
        gherkinStepLine: 21,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the skill should be installed successfully',
        stepMatchArguments: []
      }
    ]
  },
  {
    pwTestLine: 27,
    pickleLine: 24,
    tags: ['@private-packages', '@smoke', '@critical'],
    steps: [
      {
        pwStepLine: 7,
        gherkinStepLine: 4,
        keywordType: 'Context',
        textWithKeyword: 'Given Alice has published a private skill "private-access-skill"',
        isBg: true,
        stepMatchArguments: [
          {
            group: {
              start: 36,
              value: '"private-access-skill"',
              children: [
                { start: 37, value: 'private-access-skill', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 28,
        gherkinStepLine: 25,
        keywordType: 'Action',
        textWithKeyword: 'When an unauthenticated user requests info for "private-access-skill"',
        stepMatchArguments: [
          {
            group: {
              start: 42,
              value: '"private-access-skill"',
              children: [
                { start: 43, value: 'private-access-skill', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 29,
        gherkinStepLine: 26,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the request should return "not found"',
        stepMatchArguments: [
          {
            group: {
              start: 26,
              value: '"not found"',
              children: [
                { start: 27, value: 'not found', children: [{ children: [] }] },
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
    pwTestLine: 32,
    pickleLine: 29,
    tags: ['@private-packages', '@smoke', '@critical'],
    steps: [
      {
        pwStepLine: 7,
        gherkinStepLine: 4,
        keywordType: 'Context',
        textWithKeyword: 'Given Alice has published a private skill "private-access-skill"',
        isBg: true,
        stepMatchArguments: [
          {
            group: {
              start: 36,
              value: '"private-access-skill"',
              children: [
                { start: 37, value: 'private-access-skill', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 33,
        gherkinStepLine: 30,
        keywordType: 'Context',
        textWithKeyword: "Given Charlie is authenticated but not in Alice's organization",
        stepMatchArguments: []
      },
      {
        pwStepLine: 34,
        gherkinStepLine: 31,
        keywordType: 'Action',
        textWithKeyword: 'When Charlie requests info for "private-access-skill"',
        stepMatchArguments: [
          { group: { start: 0, value: 'Charlie', children: [] }, parameterTypeName: 'word' },
          {
            group: {
              start: 26,
              value: '"private-access-skill"',
              children: [
                { start: 27, value: 'private-access-skill', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 35,
        gherkinStepLine: 32,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the request should return "not found"',
        stepMatchArguments: [
          {
            group: {
              start: 26,
              value: '"not found"',
              children: [
                { start: 27, value: 'not found', children: [{ children: [] }] },
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
    pwTestLine: 38,
    pickleLine: 35,
    tags: ['@private-packages', '@smoke', '@critical'],
    steps: [
      {
        pwStepLine: 7,
        gherkinStepLine: 4,
        keywordType: 'Context',
        textWithKeyword: 'Given Alice has published a private skill "private-access-skill"',
        isBg: true,
        stepMatchArguments: [
          {
            group: {
              start: 36,
              value: '"private-access-skill"',
              children: [
                { start: 37, value: 'private-access-skill', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 39,
        gherkinStepLine: 36,
        keywordType: 'Context',
        textWithKeyword: "Given Charlie is authenticated but not in Alice's organization",
        stepMatchArguments: []
      },
      {
        pwStepLine: 40,
        gherkinStepLine: 37,
        keywordType: 'Action',
        textWithKeyword: 'When Charlie tries to install "private-access-skill"',
        stepMatchArguments: [
          { group: { start: 0, value: 'Charlie', children: [] }, parameterTypeName: 'word' },
          {
            group: {
              start: 25,
              value: '"private-access-skill"',
              children: [
                { start: 26, value: 'private-access-skill', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 41,
        gherkinStepLine: 38,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the installation should fail with "not found"',
        stepMatchArguments: [
          {
            group: {
              start: 34,
              value: '"not found"',
              children: [
                { start: 35, value: 'not found', children: [{ children: [] }] },
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
