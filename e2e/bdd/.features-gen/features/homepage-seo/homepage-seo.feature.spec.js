// Generated from: features/homepage-seo/homepage-seo.feature
import { test } from '../../../steps/fixtures.ts';

test.describe('Homepage content, SEO metadata, and analytics', () => {
  test('robots.txt allows search engine crawling of docs', { tag: ['@homepage', '@seo', '@robots'] }, async ({
    When,
    Then,
    And,
    bddState,
    e2eContext
  }) => {
    await When('I fetch "/robots.txt"', null, { bddState, e2eContext });
    await Then('the response status should be 200', null, { bddState });
    await And('the response body should contain "Allow: /docs/"', null, { bddState });
    await And('the response body should contain "Sitemap:"', null, { bddState });
  });

  test('robots.txt blocks internal routes', { tag: ['@homepage', '@seo', '@robots'] }, async ({
    When,
    Then,
    And,
    bddState,
    e2eContext
  }) => {
    await When('I fetch "/robots.txt"', null, { bddState, e2eContext });
    await Then('the response body should contain "Disallow: /api/"', null, { bddState });
    await And('the response body should contain "Disallow: /dashboard/"', null, { bddState });
  });

  test('Homepage uses correct domain in canonical and OpenGraph', { tag: ['@homepage', '@seo', '@domain'] }, async ({
    When,
    Then,
    And,
    bddState,
    e2eContext
  }) => {
    await When('I fetch the homepage HTML', null, { bddState, e2eContext });
    await Then('the HTML should contain "tankpkg.dev"', null, { bddState });
    await And('the HTML should not contain "tankpkg.com"', null, { bddState });
  });

  test('Homepage includes OpenGraph metadata', { tag: ['@homepage', '@seo', '@opengraph'] }, async ({
    When,
    Then,
    And,
    bddState,
    e2eContext
  }) => {
    await When('I fetch the homepage HTML', null, { bddState, e2eContext });
    await Then('the HTML should contain meta property "og:title"', null, { bddState });
    await And('the HTML should contain meta property "og:description"', null, { bddState });
    await And('the HTML should contain meta property "og:url"', null, { bddState });
    await And('the HTML should contain meta property "og:image"', null, { bddState });
  });

  test('Homepage includes essential meta tags', { tag: ['@homepage', '@seo', '@meta'] }, async ({
    When,
    Then,
    And,
    bddState,
    e2eContext
  }) => {
    await When('I fetch the homepage HTML', null, { bddState, e2eContext });
    await Then('the HTML should contain a meta description', null, { bddState });
    await And('the HTML should contain a canonical link to "https://tankpkg.dev"', null, { bddState });
  });

  test('Homepage includes JSON-LD FAQPage schema', { tag: ['@homepage', '@seo', '@schema'] }, async ({
    When,
    Then,
    And,
    bddState,
    e2eContext
  }) => {
    await When('I fetch the homepage HTML', null, { bddState, e2eContext });
    await Then('the HTML should contain JSON-LD structured data', null, { bddState });
    await And('the JSON-LD should include a type "FAQPage"', null, { bddState });
    await And('the JSON-LD should include a type "Organization"', null, { bddState });
  });

  test('Primary CTA is Browse Skills', { tag: ['@homepage', '@seo', '@cta'] }, async ({
    When,
    Then,
    And,
    bddState,
    e2eContext
  }) => {
    await When('I fetch the homepage HTML', null, { bddState, e2eContext });
    await Then('the primary CTA should link to "/skills"', null, { bddState });
    await And('the secondary CTA should link to "/login"', null, { bddState });
  });

  test('GA4 analytics script is loaded with correct tracking ID', { tag: ['@homepage', '@seo', '@analytics'] }, async ({
    When,
    Then,
    And,
    bddState,
    e2eContext
  }) => {
    await When('I fetch the homepage HTML', null, { bddState, e2eContext });
    await Then('the HTML should include a Google Analytics script', null, { bddState });
    await And('the GA4 tracking ID should be "G-G715LZS0Q1"', null, { bddState });
  });
});

// == technical section ==

test.use({
  $test: [({}, use) => use(test), { scope: 'test', box: true }],
  $uri: [({}, use) => use('features/homepage-seo/homepage-seo.feature'), { scope: 'test', box: true }],
  $bddFileData: [({}, use) => use(bddFileData), { scope: 'test', box: true }]
});

const bddFileData = [
  // bdd-data-start
  {
    pwTestLine: 6,
    pickleLine: 9,
    tags: ['@homepage', '@seo', '@robots'],
    steps: [
      {
        pwStepLine: 7,
        gherkinStepLine: 10,
        keywordType: 'Action',
        textWithKeyword: 'When I fetch "/robots.txt"',
        stepMatchArguments: [
          {
            group: {
              start: 8,
              value: '"/robots.txt"',
              children: [
                { start: 9, value: '/robots.txt', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 8,
        gherkinStepLine: 11,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the response status should be 200',
        stepMatchArguments: [{ group: { start: 30, value: '200', children: [] }, parameterTypeName: 'int' }]
      },
      {
        pwStepLine: 9,
        gherkinStepLine: 12,
        keywordType: 'Outcome',
        textWithKeyword: 'And the response body should contain "Allow: /docs/"',
        stepMatchArguments: [
          {
            group: {
              start: 33,
              value: '"Allow: /docs/"',
              children: [
                { start: 34, value: 'Allow: /docs/', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 10,
        gherkinStepLine: 13,
        keywordType: 'Outcome',
        textWithKeyword: 'And the response body should contain "Sitemap:"',
        stepMatchArguments: [
          {
            group: {
              start: 33,
              value: '"Sitemap:"',
              children: [
                { start: 34, value: 'Sitemap:', children: [{ children: [] }] },
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
    pwTestLine: 13,
    pickleLine: 16,
    tags: ['@homepage', '@seo', '@robots'],
    steps: [
      {
        pwStepLine: 14,
        gherkinStepLine: 17,
        keywordType: 'Action',
        textWithKeyword: 'When I fetch "/robots.txt"',
        stepMatchArguments: [
          {
            group: {
              start: 8,
              value: '"/robots.txt"',
              children: [
                { start: 9, value: '/robots.txt', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 15,
        gherkinStepLine: 18,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the response body should contain "Disallow: /api/"',
        stepMatchArguments: [
          {
            group: {
              start: 33,
              value: '"Disallow: /api/"',
              children: [
                { start: 34, value: 'Disallow: /api/', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 16,
        gherkinStepLine: 19,
        keywordType: 'Outcome',
        textWithKeyword: 'And the response body should contain "Disallow: /dashboard/"',
        stepMatchArguments: [
          {
            group: {
              start: 33,
              value: '"Disallow: /dashboard/"',
              children: [
                { start: 34, value: 'Disallow: /dashboard/', children: [{ children: [] }] },
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
    pwTestLine: 19,
    pickleLine: 24,
    tags: ['@homepage', '@seo', '@domain'],
    steps: [
      {
        pwStepLine: 20,
        gherkinStepLine: 25,
        keywordType: 'Action',
        textWithKeyword: 'When I fetch the homepage HTML',
        stepMatchArguments: []
      },
      {
        pwStepLine: 21,
        gherkinStepLine: 26,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the HTML should contain "tankpkg.dev"',
        stepMatchArguments: [
          {
            group: {
              start: 24,
              value: '"tankpkg.dev"',
              children: [
                { start: 25, value: 'tankpkg.dev', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 22,
        gherkinStepLine: 27,
        keywordType: 'Outcome',
        textWithKeyword: 'And the HTML should not contain "tankpkg.com"',
        stepMatchArguments: [
          {
            group: {
              start: 28,
              value: '"tankpkg.com"',
              children: [
                { start: 29, value: 'tankpkg.com', children: [{ children: [] }] },
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
    pwTestLine: 25,
    pickleLine: 32,
    tags: ['@homepage', '@seo', '@opengraph'],
    steps: [
      {
        pwStepLine: 26,
        gherkinStepLine: 33,
        keywordType: 'Action',
        textWithKeyword: 'When I fetch the homepage HTML',
        stepMatchArguments: []
      },
      {
        pwStepLine: 27,
        gherkinStepLine: 34,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the HTML should contain meta property "og:title"',
        stepMatchArguments: [
          {
            group: {
              start: 38,
              value: '"og:title"',
              children: [
                { start: 39, value: 'og:title', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 28,
        gherkinStepLine: 35,
        keywordType: 'Outcome',
        textWithKeyword: 'And the HTML should contain meta property "og:description"',
        stepMatchArguments: [
          {
            group: {
              start: 38,
              value: '"og:description"',
              children: [
                { start: 39, value: 'og:description', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 29,
        gherkinStepLine: 36,
        keywordType: 'Outcome',
        textWithKeyword: 'And the HTML should contain meta property "og:url"',
        stepMatchArguments: [
          {
            group: {
              start: 38,
              value: '"og:url"',
              children: [{ start: 39, value: 'og:url', children: [{ children: [] }] }, { children: [{ children: [] }] }]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 30,
        gherkinStepLine: 37,
        keywordType: 'Outcome',
        textWithKeyword: 'And the HTML should contain meta property "og:image"',
        stepMatchArguments: [
          {
            group: {
              start: 38,
              value: '"og:image"',
              children: [
                { start: 39, value: 'og:image', children: [{ children: [] }] },
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
    pwTestLine: 33,
    pickleLine: 40,
    tags: ['@homepage', '@seo', '@meta'],
    steps: [
      {
        pwStepLine: 34,
        gherkinStepLine: 41,
        keywordType: 'Action',
        textWithKeyword: 'When I fetch the homepage HTML',
        stepMatchArguments: []
      },
      {
        pwStepLine: 35,
        gherkinStepLine: 42,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the HTML should contain a meta description',
        stepMatchArguments: []
      },
      {
        pwStepLine: 36,
        gherkinStepLine: 43,
        keywordType: 'Outcome',
        textWithKeyword: 'And the HTML should contain a canonical link to "https://tankpkg.dev"',
        stepMatchArguments: [
          {
            group: {
              start: 44,
              value: '"https://tankpkg.dev"',
              children: [
                { start: 45, value: 'https://tankpkg.dev', children: [{ children: [] }] },
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
    pwTestLine: 39,
    pickleLine: 48,
    tags: ['@homepage', '@seo', '@schema'],
    steps: [
      {
        pwStepLine: 40,
        gherkinStepLine: 49,
        keywordType: 'Action',
        textWithKeyword: 'When I fetch the homepage HTML',
        stepMatchArguments: []
      },
      {
        pwStepLine: 41,
        gherkinStepLine: 50,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the HTML should contain JSON-LD structured data',
        stepMatchArguments: []
      },
      {
        pwStepLine: 42,
        gherkinStepLine: 51,
        keywordType: 'Outcome',
        textWithKeyword: 'And the JSON-LD should include a type "FAQPage"',
        stepMatchArguments: [
          {
            group: {
              start: 34,
              value: '"FAQPage"',
              children: [
                { start: 35, value: 'FAQPage', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 43,
        gherkinStepLine: 52,
        keywordType: 'Outcome',
        textWithKeyword: 'And the JSON-LD should include a type "Organization"',
        stepMatchArguments: [
          {
            group: {
              start: 34,
              value: '"Organization"',
              children: [
                { start: 35, value: 'Organization', children: [{ children: [] }] },
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
    pwTestLine: 46,
    pickleLine: 57,
    tags: ['@homepage', '@seo', '@cta'],
    steps: [
      {
        pwStepLine: 47,
        gherkinStepLine: 58,
        keywordType: 'Action',
        textWithKeyword: 'When I fetch the homepage HTML',
        stepMatchArguments: []
      },
      {
        pwStepLine: 48,
        gherkinStepLine: 59,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the primary CTA should link to "/skills"',
        stepMatchArguments: [
          {
            group: {
              start: 31,
              value: '"/skills"',
              children: [
                { start: 32, value: '/skills', children: [{ children: [] }] },
                { children: [{ children: [] }] }
              ]
            },
            parameterTypeName: 'string'
          }
        ]
      },
      {
        pwStepLine: 49,
        gherkinStepLine: 60,
        keywordType: 'Outcome',
        textWithKeyword: 'And the secondary CTA should link to "/login"',
        stepMatchArguments: [
          {
            group: {
              start: 33,
              value: '"/login"',
              children: [{ start: 34, value: '/login', children: [{ children: [] }] }, { children: [{ children: [] }] }]
            },
            parameterTypeName: 'string'
          }
        ]
      }
    ]
  },
  {
    pwTestLine: 52,
    pickleLine: 65,
    tags: ['@homepage', '@seo', '@analytics'],
    steps: [
      {
        pwStepLine: 53,
        gherkinStepLine: 66,
        keywordType: 'Action',
        textWithKeyword: 'When I fetch the homepage HTML',
        stepMatchArguments: []
      },
      {
        pwStepLine: 54,
        gherkinStepLine: 67,
        keywordType: 'Outcome',
        textWithKeyword: 'Then the HTML should include a Google Analytics script',
        stepMatchArguments: []
      },
      {
        pwStepLine: 55,
        gherkinStepLine: 68,
        keywordType: 'Outcome',
        textWithKeyword: 'And the GA4 tracking ID should be "G-G715LZS0Q1"',
        stepMatchArguments: [
          {
            group: {
              start: 30,
              value: '"G-G715LZS0Q1"',
              children: [
                { start: 31, value: 'G-G715LZS0Q1', children: [{ children: [] }] },
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
