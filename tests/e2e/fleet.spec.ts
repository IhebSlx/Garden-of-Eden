/**
 * SPEC 10, Phase 1 DoD: "Playwright smoke covers focus / filter / search / add /
 * rename / delete / undo."
 *
 * Every test starts from a clean IndexedDB so the app seeds the Solarlux example.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const GHOST_OPACITY = 0.05;

async function freshApp(page: Page): Promise<void> {
  // Wipe once per test, not on every navigation - a reload must find the saved fleet.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e-wiped') === null) {
      sessionStorage.setItem('e2e-wiped', '1');
      indexedDB.deleteDatabase('agent-fleet-studio');
    }
  });
  await page.goto('/');
  await expect(page.getByTestId('board')).toBeVisible();
  // Wait for the seeded fleet to be laid out and fitted.
  await expect(page.getByTestId('agent-card')).toHaveCount(20);
  await expect(page.getByTestId('breadcrumb')).toContainText('Solarlux Fleet');
}

/** All cards showing this agent's name (a shared agent has several). */
function cards(page: Page, name: string) {
  return page.getByTestId('agent-card').filter({ hasText: name });
}

test.beforeEach(async ({ page }) => {
  await freshApp(page);
});

test('seeds the Solarlux fleet with its shared agents rendered once per parent', async ({ page }) => {
  // 16 agents but 20 instances: PowerPoint ×3, Translator ×2, SharePoint ×2.
  await expect(page.getByTestId('agent-card')).toHaveCount(20);
  await expect(cards(page, 'PowerPoint Creator')).toHaveCount(3);
  await expect(cards(page, 'Translator DE/EN')).toHaveCount(2);
  await expect(page.getByText('×3').first()).toBeVisible();
});

test('focus frames the subtree, ghosts the rest, and Esc restores the fleet', async ({ page }) => {
  const marketing = cards(page, 'Marketing').first();
  const zoomBefore = await page.getByTestId('zoom-pct').innerText();

  await marketing.click();

  await expect(page.getByTestId('breadcrumb-here')).toHaveText('Marketing');

  // SPEC 5.2: real zoom-to-fit of the subtree, not a pan.
  await expect
    .poll(async () => page.getByTestId('zoom-pct').innerText(), { timeout: 5000 })
    .not.toBe(zoomBefore);

  // Everything outside the branch ghosts to 5%, and is still in the DOM.
  const hr = cards(page, 'HR').first();
  await expect(hr).toHaveClass(/ghost/);
  await expect(hr).toHaveCSS('opacity', String(GHOST_OPACITY));
  await expect(marketing).not.toHaveClass(/ghost/);

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('breadcrumb-here')).toHaveCount(0);
  await expect(hr).not.toHaveClass(/ghost/);
});

test('a peer link never expands focus (SPEC 5.2)', async ({ page }) => {
  // Business Development has a peer link to Objektvertrieb.
  await cards(page, 'Business Development').first().click();
  await expect(page.getByTestId('breadcrumb-here')).toHaveText('Business Development');
  await expect(cards(page, 'Objektvertrieb').first()).toHaveClass(/ghost/);
});

test('focusing a shared agent keeps every copy lit', async ({ page }) => {
  await cards(page, 'PowerPoint Creator').first().click();
  await expect(page.getByTestId('breadcrumb-here')).toHaveText('PowerPoint Creator');

  const copies = cards(page, 'PowerPoint Creator');
  await expect(copies).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) {
    await expect(copies.nth(i)).not.toHaveClass(/ghost/);
  }
});

test('the status filter ghosts non-matching components and composes with focus', async ({ page }) => {
  await page.getByTestId('filter-live').click();

  // Business Development is Planned, so it ghosts under a Live filter.
  await expect(cards(page, 'Business Development').first()).toHaveClass(/ghost/);
  await expect(cards(page, 'Objektvertrieb').first()).not.toHaveClass(/ghost/);

  // Intersecting with focus: inside Objektvertrieb only the Live parts stay lit.
  await cards(page, 'Objektvertrieb').first().click();
  await expect(cards(page, 'Lead Qualifier').first()).not.toHaveClass(/ghost/);
  await expect(cards(page, 'Angebots-Assistent').first()).toHaveClass(/ghost/);

  await page.getByTestId('filter-all').click();
  await expect(cards(page, 'Angebots-Assistent').first()).not.toHaveClass(/ghost/);
});

test('search finds an agent across languages and focuses it', async ({ page }) => {
  const search = page.getByTestId('search').getByRole('textbox');
  // "offer" reaches the German "Angebots-Assistent" through the synonym table.
  await search.fill('offer');

  const results = page.getByTestId('search-results');
  await expect(results).toBeVisible();
  await expect(results).toContainText('Angebots-Assistent');

  await search.press('Enter');
  await expect(page.getByTestId('breadcrumb-here')).toHaveText('Angebots-Assistent');
  // The panel name is an editable input, so assert its value rather than text.
  await expect(page.getByTestId('panel-name')).toHaveValue('Angebots-Assistent');
});

test('the panel shows relations, opens a detail card and jumps to a linked agent', async ({ page }) => {
  await cards(page, 'Objektvertrieb').first().click();

  const panel = page.getByTestId('inspector');
  await expect(panel).toContainText('Reports to');
  await expect(panel).toContainText('Solarlux Orchestrator');
  // Peer relation from SPEC 5.7.
  await expect(panel).toContainText('(same level)');

  await panel.getByRole('button', { name: 'Unternehmenskontext', exact: true }).click();
  const detail = page.getByTestId('item-detail');
  await expect(detail).toContainText('Ready');
  await expect(detail).toContainText('linked ✓');

  // "linked to" jumps focus to another agent (SPEC 5.7).
  await detail.getByRole('button', { name: 'Solarlux Orchestrator' }).click();
  await expect(page.getByTestId('breadcrumb-here')).toHaveText('Solarlux Orchestrator');
});

test('a workflow tool renders its steps as a mini-DAG (SPEC 8.6)', async ({ page }) => {
  await cards(page, 'Lead Qualifier').first().click();
  await page
    .getByTestId('inspector')
    .getByRole('button', { name: 'Lead-Scoring Flow', exact: true })
    .click();

  const diagram = page.getByTestId('workflow-diagram');
  await expect(diagram).toBeVisible();
  await expect(diagram).toContainText('new lead in CRM');
  await expect(diagram).toContainText('Notify Objektvertrieb (Teams)');
});

test('add, rename and delete a sub-agent, then undo each step', async ({ page }) => {
  await cards(page, 'HR').first().click();
  await page.getByTestId('add-sub-agent').click();

  // SPEC 5.8: two fields max - the new agent arrives named and Planned.
  await expect(page.getByTestId('panel-name')).toHaveValue('New agent');
  await expect(page.getByTestId('agent-card')).toHaveCount(21);

  // Rename from the panel (SPEC 8.10).
  await page.getByTestId('panel-name').fill('Payroll Helper');
  await page.getByTestId('panel-name').press('Enter');
  await expect(cards(page, 'Payroll Helper')).toHaveCount(1);

  // Delete, with the confirmation step.
  await page.getByTestId('delete-agent').click();
  await page.getByTestId('delete-confirm-yes').click();
  await expect(cards(page, 'Payroll Helper')).toHaveCount(0);
  await expect(page.getByTestId('agent-card')).toHaveCount(20);

  // Undo brings it back, undo again reverts the rename (SPEC 8.1).
  await page.keyboard.press('Control+z');
  await expect(cards(page, 'Payroll Helper')).toHaveCount(1);

  await page.keyboard.press('Control+z');
  await expect(cards(page, 'New agent')).toHaveCount(1);

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('agent-card')).toHaveCount(20);
});

test('inline rename on the card propagates to every copy of a shared agent', async ({ page }) => {
  // Click once to focus first: that click animates the viewport, so a cold
  // double-click would lose the card mid-flight (the prototype behaves the same).
  const first = cards(page, 'Translator DE/EN').first();
  await first.click();
  await expect(page.getByTestId('breadcrumb-here')).toHaveText('Translator DE/EN');

  await first.locator('.nmtext').dblclick();

  const editor = page.getByTestId('card-rename');
  await expect(editor).toBeVisible();
  await editor.fill('Übersetzer');
  await editor.press('Enter');

  // One agent, two instances - both must read the new name (SPEC 2.3).
  await expect(cards(page, 'Übersetzer')).toHaveCount(2);
  await expect(cards(page, 'Translator DE/EN')).toHaveCount(0);
});

test('deleting a shared agent warns and names its parents', async ({ page }) => {
  await cards(page, 'PowerPoint Creator').first().click();
  await page.getByTestId('delete-agent').click();

  const confirm = page.getByTestId('delete-confirm');
  await expect(confirm).toContainText('shared sub-agent');
  await expect(confirm).toContainText('Marketing');
  await expect(confirm).toContainText('Objektvertrieb');
});

test('a library item in use cannot be deleted, and the usage list is shown', async ({ page }) => {
  await page.getByTestId('fleet-menu-toggle').click();
  await page.getByRole('button', { name: /Libraries/ }).click();

  const manager = page.getByTestId('library-manager');
  await expect(manager).toBeVisible();
  await manager.getByRole('button', { name: 'Data sources' }).click();
  await manager.getByRole('button', { name: 'Delete Unternehmenskontext' }).click();

  const error = page.getByTestId('library-error');
  await expect(error).toContainText('still used by');
  await expect(error).toContainText('Solarlux Orchestrator');
});

test('semantic zoom collapses sub-agent cards to dots at overview zoom (SPEC 5.5)', async ({ page }) => {
  // At this viewport the whole fleet fits between the two thresholds, so sub-agent
  // role lines are hidden but the cards have not collapsed to dots yet.
  await expect(page.getByTestId('board')).toHaveClass(/far/);

  const leaf = cards(page, 'Onboarding Guide').first();
  await expect(leaf.locator('.rl')).toBeHidden();

  // Focusing always lands past the thresholds - detail is guaranteed when focused.
  await cards(page, 'HR').first().click();
  await expect(page.getByTestId('board')).not.toHaveClass(/far/);
  await expect(leaf.locator('.rl')).toBeVisible();
});

test('a new fleet from the Company template starts entirely Planned', async ({ page }) => {
  await page.getByTestId('fleet-menu-toggle').click();
  await page.getByTestId('new-company-fleet').click();

  await expect(page.getByTestId('agent-card')).toHaveCount(5);
  const planned = page.locator('.card.st-planned');
  await expect(planned).toHaveCount(5);
});

test('the fleet survives a reload (SPEC 7 autosave)', async ({ page }) => {
  await cards(page, 'HR').first().click();
  await page.getByTestId('panel-name').fill('People Ops');
  await page.getByTestId('panel-name').press('Enter');
  await expect(cards(page, 'People Ops')).toHaveCount(1);

  // Give the debounced IndexedDB write time to land, then reload.
  await page.waitForTimeout(600);
  await page.reload();

  await expect(page.getByTestId('agent-card')).toHaveCount(20);
  await expect(cards(page, 'People Ops')).toHaveCount(1);
});
