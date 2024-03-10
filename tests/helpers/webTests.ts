import { APIRequestContext, Page, expect, test } from '@playwright/test';
import { CosmosFixtureJson, CosmosFixturesJson } from 'react-cosmos';
import { FixtureId, createRendererUrl } from 'react-cosmos-core';
import { exampleName } from './envVars.js';

export function webTests(url: string) {
  test.describe('homepage', () => {
    test('has document title', async ({ page }) => {
      await page.goto(url);
      await expect(page).toHaveTitle(`example-${exampleName()}`);
    });

    test('displays welcome message', async ({ page }) => {
      await page.goto(url);
      await expect(page.getByText('Welcome to React Cosmos')).toBeVisible();
    });

    test('shows renderer connected notification', async ({ page }) => {
      await page.goto(url);
      await expect(page.getByText('Renderer connected')).toBeVisible();
    });
  });

  test.describe('nav', () => {
    test('renders tree view root items', async ({ page }) => {
      await page.goto(url);
      await expect(page.getByText('Counter', { exact: true })).toBeVisible();
      await expect(page.getByText('CounterButton')).toBeVisible();
      await expect(page.getByText('WelcomeMessage')).toBeVisible();
      await expect(page.getByText('HelloWorld')).toBeVisible();
    });

    test('expands tree view items', async ({ page }) => {
      await page.goto(url);
      await page.click('text=Counter');
      await expect(page.getByText('default', { exact: true })).toBeVisible();
      await expect(page.getByText('small number')).toBeVisible();
      await expect(page.getByText('large number')).toBeVisible();
    });
  });

  test.describe('select fixture', () => {
    test('renders selected fixtures', async ({ page }) => {
      await page.goto(url);
      await page.click('text=HelloWorld');
      await expect(rendererRoot(page).getByText('Hello World!')).toBeVisible();
    });

    test('renders updated fixture', async ({ page }) => {
      await page.goto(url);
      await page.click('text=Counter');
      await page.click('text=large number');

      const button = rendererRoot(page).getByTitle('Click to increment');
      await expect(button).toContainText('555555555 times');

      await button.dblclick();
      await expect(button).toContainText('555555557 times');
    });

    test('renders searched fixture', async ({ page }) => {
      await page.goto(url);

      await page.getByText('Search fixtures').waitFor();
      await page.keyboard.press('Control+K');
      await page.getByPlaceholder('Fixture search').fill('Hello');
      await page.keyboard.press('Enter');

      await expect(rendererRoot(page)).toContainText('Hello World!');
    });

    test('uses search key shortcut in renderer iframe', async ({ page }) => {
      await page.goto(url);
      await page.click('text=HelloWorld');

      // Clicking on the fixture content focuses the iframe
      await rendererRoot(page).getByText('Hello World!').click();

      await page.keyboard.press('Control+K');
      await page.getByPlaceholder('Fixture search').waitFor();
    });
  });

  test.describe('static path', () => {
    test('serves static asset', async ({ request }) => {
      const response = await request.get(`${url}/cookie.txt`);
      expect(await response.text()).toContain('nom nom nom');
    });
  });

  test.describe('cosmos.fixture.json', () => {
    test('contains renderer URL', async ({ request }) => {
      const { rendererUrl } = await getFixturesJson(request, url);
      expect(typeof rendererUrl).toBe('string');
    });

    test('contains fixture data', async ({ request }) => {
      const { fixtures } = await getFixturesJson(request, url);
      expect(fixtures).toContainEqual({
        filePath: 'src/WelcomeMessage/WelcomeMessage.fixture.tsx',
        cleanPath: ['src', 'WelcomeMessage', 'WelcomeMessage'],
        rendererUrl: expect.stringContaining(
          '?fixtureId=%7B%22path%22%3A%22src%2FWelcomeMessage%2FWelcomeMessage.fixture.tsx%22%7D&locked=true'
        ),
      });
    });

    test('contains fixture renderer URL', async ({ request, page }) => {
      const { fixtures } = await getFixturesJson(request, url);
      const fixture = expectFixture(fixtures, 'HelloWorld.mdx');
      await page.goto(resolveRendererUrl(url, fixture.rendererUrl));
      await expect(page.getByText('Hello World!')).toBeVisible();
    });
  });

  test('reads renderer responses', async ({ request, page }) => {
    const { rendererUrl, fixtures } = await getFixturesJson(request, url);
    const fixture = await expectFixture(fixtures, 'Counter.fixture.tsx');

    if (!rendererUrl) {
      throw new Error('Renderer URL not found');
    }

    let _fixtureItem: any;
    page.exposeFunction('fixtureLoaded', (fixtureItem: any) => {
      _fixtureItem = fixtureItem;
    });

    await page.goto(fixture.rendererUrl);

    // TODO: How to get fixture IDs instead of fixture names?
    await expect.poll(() => _fixtureItem).not.toBe(undefined);

    const fixtureNames = _fixtureItem.fixtureNames as string[];

    expect(fixtureNames).toEqual(['default', 'small number', 'large number']);

    if (fixtureNames) {
      console.log({ fixtureNames });
      for (const fixtureName of fixtureNames) {
        await takeFixtureSnapshot(
          page,
          rendererUrl,
          { path: fixture.filePath, name: fixtureName },
          [...fixture.cleanPath, fixtureName]
        );
      }
    } else {
      await takeFixtureSnapshot(
        page,
        rendererUrl,
        { path: fixture.filePath },
        fixture.cleanPath
      );
    }
  });
}

function rendererRoot(page: Page) {
  return page.frameLocator('iframe').locator('#root');
}

async function getFixturesJson(request: APIRequestContext, url: string) {
  const response = await request.get(url + '/cosmos.fixtures.json');
  return (await response.json()) as CosmosFixturesJson;
}

function expectFixture(fixtures: CosmosFixtureJson[], fileName: string) {
  const fixture = fixtures.find(f => f.filePath.endsWith(fileName));
  expect(fixture).toBeTruthy();
  return fixture!;
}

function resolveRendererUrl(url: string, rendererUrl: string) {
  try {
    return new URL(rendererUrl).href;
  } catch (err) {
    return new URL(rendererUrl, url).href;
  }
}

async function takeFixtureSnapshot(
  page: Page,
  rendererUrl: string,
  fixtureId: FixtureId,
  cleanPath: string[]
) {
  const fixtureUrl = createRendererUrl(rendererUrl, fixtureId, true);
  await page.goto(fixtureUrl);
  await expect(page).toHaveScreenshot(`${cleanPath.join('-')}.png`);
}
