/**
 * SPEC 10, Phase 1 DoD: "Playwright smoke covers focus / filter / search / add /
 * rename / delete / undo."
 *
 * A fresh install now opens the Solarlux Vision fleet, so `freshApp` switches to the
 * demo the suite below is written against - one click, the same one a user makes.
 */
import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

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

  // A fresh install lands on the Vision fleet; the suite below needs the demo.
  const breadcrumb = await page.getByTestId('breadcrumb').textContent();
  if (breadcrumb === null || !breadcrumb.includes('Solarlux Fleet')) {
    await page.getByTestId('fleet-menu-toggle').click();
    await page.getByTestId('load-example').click();
  }
  // Wait for the fleet to be laid out and fitted.
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
  // Data speaks about provision now: Existing rather than Ready.
  await expect(detail).toContainText('Existing');
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
  await page.getByTestId('view-library').click();
  const library = page.getByTestId('library-view');
  await expect(library).toBeVisible();

  await library.getByTestId('library-row').filter({ hasText: 'Unternehmenskontext' }).first().click();
  await library.getByTestId('item-delete').click();
  await library.getByTestId('item-delete-confirm').click();

  const error = library.getByTestId('item-problem');
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

test('2D and 3D share one state: focus and selection round-trip across the switch (SPEC 5.1)', async ({
  page,
}) => {
  await cards(page, 'Marketing').first().click();
  await expect(page.getByTestId('breadcrumb-here')).toHaveText('Marketing');
  await page.getByTestId('filter-live').click();

  await page.getByTestId('view-3d').click();
  await expect(page.getByTestId('scene3d')).toBeVisible();
  // The whole view state survives: focus, selection, panel and filter.
  await expect(page.getByTestId('breadcrumb-here')).toHaveText('Marketing');
  await expect(page.getByTestId('panel-name')).toHaveValue('Marketing');
  await expect(page.getByTestId('filter-live')).toHaveClass(/on/);

  await page.getByTestId('view-2d').click();
  await expect(page.getByTestId('breadcrumb-here')).toHaveText('Marketing');
  await expect(page.getByTestId('panel-name')).toHaveValue('Marketing');
  await expect(page.getByTestId('filter-live')).toHaveClass(/on/);
  // ...and the board still has the same ghosting it had before the round-trip.
  await expect(cards(page, 'HR').first()).toHaveClass(/ghost/);
});

test('the 3D scene renders and its canvas is interactive', async ({ page }) => {
  await page.getByTestId('view-3d').click();
  const scene = page.getByTestId('scene3d');
  await expect(scene).toBeVisible();
  await expect(scene.locator('canvas')).toBeVisible();

  // Esc still leaves focus while the 3D view is up (SPEC 5.2).
  await page.getByTestId('view-2d').click();
  await cards(page, 'HR').first().click();
  await page.getByTestId('view-3d').click();
  await expect(page.getByTestId('breadcrumb-here')).toHaveText('HR');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('breadcrumb-here')).toHaveCount(0);
});

test('keyboard shortcuts drive view, filter, details, search and help', async ({ page }) => {
  // View switch
  await page.keyboard.press('3');
  await expect(page.getByTestId('view-3d')).toHaveClass(/on/);
  await page.keyboard.press('2');
  await expect(page.getByTestId('view-2d')).toHaveClass(/on/);

  // Status filter
  await page.keyboard.press('l');
  await expect(page.getByTestId('filter-live')).toHaveClass(/on/);
  await page.keyboard.press('p');
  await expect(page.getByTestId('filter-planned')).toHaveClass(/on/);
  await page.keyboard.press('a');
  await expect(page.getByTestId('filter-all')).toHaveClass(/on/);

  // Details toggle
  await page.keyboard.press('d');
  await expect(page.getByTestId('details-toggle')).toHaveClass(/on/);
  await page.keyboard.press('d');
  await expect(page.getByTestId('details-toggle')).not.toHaveClass(/on/);

  // Search focus, then Escape releases it without leaving focus behind
  await page.keyboard.press('/');
  await expect(page.getByTestId('search').getByRole('textbox')).toBeFocused();
  await page.keyboard.press('Escape');

  // Help sheet
  await page.keyboard.press('?');
  await expect(page.getByTestId('shortcuts-help')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('shortcuts-help')).toHaveCount(0);
});

test('a shortcut key typed into a field stays in the field', async ({ page }) => {
  await cards(page, 'HR').first().click();
  const name = page.getByTestId('panel-name');
  await name.fill('Data & People');
  await name.press('Enter');

  // "d" and "a" are shortcuts, but they were typed - nothing should have toggled.
  await expect(cards(page, 'Data & People')).toHaveCount(1);
  await expect(page.getByTestId('details-toggle')).not.toHaveClass(/on/);
  await expect(page.getByTestId('filter-all')).toHaveClass(/on/);
});

test('an edge can be selected and its status and label edited (SPEC 8.5)', async ({ page }) => {
  await cards(page, 'Marketing').first().click();

  // Dispatched on the edge rather than clicked at a coordinate. A force-click
  // lands on the centre of the path's bounding box, which for a curve is usually
  // not on the curve — and the focus cascade is still moving it when the click
  // arrives, so the point that worked a moment ago no longer does.
  await page.locator('.react-flow__edge').first().dispatchEvent('click');

  const panel = page.getByTestId('edge-inspector');
  await expect(panel).toBeVisible();
  await panel.getByTestId('edge-label').fill('escalates to');
  await panel.getByTestId('edge-label').press('Enter');
  await expect(panel.getByTestId('edge-label')).toHaveValue('escalates to');
});

async function openCatalog(page: Page): Promise<void> {
  await page.getByTestId('fleet-menu-toggle').click();
  await page.getByTestId('open-catalog').click();
  await expect(page.getByTestId('catalog')).toBeVisible();
}

test('the catalog creates an agent with no fleet involved, then adds it to one', async ({ page }) => {
  await openCatalog(page);

  await page.getByTestId('catalog-new-agent-name').fill('Angebots-Bot');
  await page.getByTestId('catalog-new-agent-role').fill('Drafts offers');
  await page.getByRole('button', { name: 'Create agent' }).click();

  await expect(page.getByTestId('catalog-agent-editor')).toBeVisible();
  await expect(page.getByTestId('catalog-tab-agents')).toContainText('1');

  await page.getByTestId('catalog-add-to-fleet').click();
  await expect(page.getByTestId('catalog-message')).toContainText('added to');

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(cards(page, 'Angebots-Bot')).toHaveCount(1);
});

test('the catalog builds a skill and a branching workflow tool', async ({ page }) => {
  await openCatalog(page);

  await page.getByTestId('catalog-tab-skill').click();
  await page.getByTestId('catalog-new-item').fill('Angebotslogik');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByTestId('catalog-skill-instructions').fill('Always use the current price list.');
  await expect(page.getByTestId('catalog-tab-skill')).toContainText('1');

  await page.getByTestId('catalog-tab-tool').click();
  await page.getByTestId('catalog-new-item').fill('Angebots-Flow');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  // A new tool opens straight into its editor, ready for steps (SPEC §8.6).
  const editor = page.getByTestId('tool-editor');
  await expect(editor).toBeVisible();
  await editor.getByTestId('wf-new-step').fill('Trigger on qualified project');
  await editor.getByRole('button', { name: 'Add step' }).click();
  await editor.getByTestId('wf-new-step').fill('Build the PDF');
  await editor.getByRole('button', { name: 'Add step' }).click();

  await expect(page.getByTestId('wf-step')).toHaveCount(2);
});

test('a Copilot Studio export becomes an agent, and the file stays downloadable', async ({ page }) => {
  await openCatalog(page);

  await page
    .getByTestId('catalog-yaml-input')
    .setInputFiles('tests/fixtures/copilot/objektvertrieb.yaml');

  await expect(page.getByTestId('catalog-message')).toContainText('Imported "Objektvertrieb"');
  await expect(page.getByTestId('catalog-message')).toContainText('7 skills, 8 tools');
  await expect(page.getByTestId('catalog-tab-skill')).toContainText('7');
  await expect(page.getByTestId('catalog-tab-tool')).toContainText('8');

  // The original file is handed back byte-for-byte.
  const download = page.waitForEvent('download');
  await page.getByTestId('catalog-download-yaml').click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('objektvertrieb.yaml');

  // ...and the agent lands in the fleet with everything it brought.
  await page.getByTestId('catalog-add-to-fleet').click();
  await page.getByRole('button', { name: 'Done' }).click();

  // The imported agent is focused and open the moment it lands - and the seeded
  // demo fleet has its own "Objektvertrieb", so asserting on the open panel is the
  // only unambiguous way to look at the imported one.
  const panel = page.getByTestId('inspector');
  await expect(page.getByTestId('panel-name')).toHaveValue('Objektvertrieb');
  await expect(panel).toContainText('Produktfamilien');
  await expect(panel).toContainText('Portal-Suche Objektportal');
  // Every data platform the export reaches, not only the knowledge source.
  await expect(panel).toContainText('Projektakte');
  await expect(panel).toContainText('slxcrowd / opportunities');
  await expect(panel).toContainText('Objektportal / Objektübersicht');
});

test('a file that is not a Copilot export is refused with a readable reason', async ({ page }) => {
  await openCatalog(page);
  await page.getByTestId('catalog-yaml-input').setInputFiles({
    name: 'not-an-agent.yaml',
    mimeType: 'application/x-yaml',
    buffer: Buffer.from('kind: SomethingElse\nname: nope\n'),
  });

  await expect(page.getByTestId('catalog-message')).toContainText('BotDefinition');
  await expect(page.getByTestId('catalog-tab-agents')).toContainText('0');
});

test('the catalog survives a reload', async ({ page }) => {
  await openCatalog(page);
  await page.getByTestId('catalog-new-agent-name').fill('Persistent Bot');
  await page.getByRole('button', { name: 'Create agent' }).click();
  await expect(page.getByTestId('catalog-tab-agents')).toContainText('1');

  await page.waitForTimeout(600);
  await page.reload();

  await openCatalog(page);
  await expect(page.getByTestId('catalog-tab-agents')).toContainText('1');
  // The name lives in an editable input, so assert its value rather than text.
  await expect(page.getByTestId('catalog').locator('.lib-name').first()).toHaveValue('Persistent Bot');
});



test('the app is branded as the Solarlux Agent Visualiser', async ({ page }) => {
  await expect(page).toHaveTitle('Solarlux Agent Visualiser');

  const brand = page.getByTestId('brand');
  await expect(brand).toContainText('Agent Visualiser');

  // The supplied wordmark, actually decoded by the browser rather than a broken img.
  const logo = brand.getByAltText('Solarlux');
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
});

test('an agent can be moved between levels from the panel', async ({ page }) => {
  await cards(page, 'Lead Qualifier').first().click();
  const panel = page.getByTestId('inspector');

  const chip = panel.getByTestId('kind-chip');
  await expect(chip).toContainText('Sub-agent');
  await chip.click();
  await panel.getByTestId('kind-chip-open').getByRole('button', { name: 'Department' }).click();
  await expect(panel.getByTestId('kind-chip')).toContainText('Department');

  // It survives a round-trip through the store, not just the chip's own state.
  await page.keyboard.press('Escape');
  await cards(page, 'Lead Qualifier').first().click();
  await expect(page.getByTestId('inspector').getByTestId('kind-chip')).toContainText('Department');
});

test('the orchestrator cannot be demoted from the panel (SPEC 4: exactly one)', async ({ page }) => {
  await cards(page, 'Solarlux Orchestrator').first().click();
  const chip = page.getByTestId('inspector').getByTestId('kind-chip');
  await expect(chip).toContainText('Orchestrator');
  await expect(chip).toBeDisabled();
});

test('a shared agent shows its level and its shared badge side by side', async ({ page }) => {
  await cards(page, 'SharePoint Reader').first().click();
  const panel = page.getByTestId('inspector');
  await expect(panel.getByTestId('shared-badge')).toContainText('Shared agent');
  // The level stays editable on a shared agent — that is exactly when it is needed.
  await expect(panel.getByTestId('kind-chip')).toBeEnabled();
});

test('a note can be written on an agent and survives a reload', async ({ page }) => {
  await cards(page, 'Lead Qualifier').first().click();
  const notes = page.getByTestId('inspector').getByTestId('panel-notes');
  await notes.fill('Ask Marketing whether the 2023 template is still current.');
  await notes.blur();

  // Give the debounced IndexedDB write time to land, then reload.
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByTestId('board')).toBeVisible();
  await cards(page, 'Lead Qualifier').first().click();
  await expect(page.getByTestId('inspector').getByTestId('panel-notes')).toHaveValue(
    'Ask Marketing whether the 2023 template is still current.',
  );
});

test('a note on a library item is marked in the list and kept with the item', async ({ page }) => {
  await page.getByTestId('view-library').click();
  const library = page.getByTestId('library-view');

  await library.getByTestId('library-row').first().click();
  await library.getByTestId('data-notes').fill('Ask Marketing whether this is still current.');
  await library.getByTestId('data-notes').blur();

  // The list marks which items carry a note, so one is findable again.
  await expect(library.getByTestId('library-note-dot').first()).toBeVisible();

  // And it survives a reload, so it is stored rather than a UI flourish.
  await page.waitForTimeout(600);
  await page.reload();
  await page.getByTestId('view-library').click();
  await page.getByTestId('library-row').first().click();
  await expect(page.getByTestId('data-notes')).toHaveValue(
    'Ask Marketing whether this is still current.',
  );
});

test('notes are undoable like any other edit', async ({ page }) => {
  await cards(page, 'Lead Qualifier').first().click();
  const notes = page.getByTestId('inspector').getByTestId('panel-notes');
  await notes.fill('A note that should vanish.');
  await notes.blur();

  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('inspector').getByTestId('panel-notes')).toHaveValue('');
});

/* ---------- The Library view: Data, Tools and Skills ---------- */

test('Library is a third view, with three filtrable tabs', async ({ page }) => {
  await expect(page.getByTestId('view-library')).toBeVisible();
  await page.getByTestId('view-library').click();

  await expect(page.getByTestId('view-switch')).toHaveAttribute('data-view', 'library');
  await expect(page.getByTestId('viewlayer-library')).toHaveAttribute('data-live', 'true');
  // The board layer goes dark but stays mounted, so its pan and zoom survive.
  await expect(page.getByTestId('viewlayer-2d')).toHaveAttribute('data-live', 'false');
  // Chrome that only answers questions about the graph goes with it.
  await expect(page.getByTestId('filter-bar')).toHaveCount(0);
  await expect(page.getByTestId('auto-arrange')).toHaveCount(0);

  const library = page.getByTestId('library-view');
  await expect(library).toHaveAttribute('data-tab', 'data');
  for (const tab of ['data', 'tools', 'skills']) {
    await expect(library.getByTestId(`library-tab-${tab}`)).toBeVisible();
  }

  // Each tab filters by the axes its own content actually has.
  await expect(library.getByTestId('data-filter')).toBeVisible();

  await library.getByTestId('library-tab-tools').click();
  await expect(library).toHaveAttribute('data-tab', 'tools');
  await expect(library.getByTestId('library-search')).toBeVisible();
  await expect(library.getByTestId('library-tool-type')).toBeVisible();

  await library.getByTestId('library-tab-skills').click();
  await expect(library).toHaveAttribute('data-tab', 'skills');
  await expect(library.getByTestId('library-search')).toBeVisible();
  // A skill has no type and no state, so it is offered neither.
  await expect(library.getByTestId('library-tool-type')).toHaveCount(0);

  // And back to the board, which keeps its own chrome.
  await page.getByTestId('view-2d').click();
  await expect(page.getByTestId('filter-bar')).toBeVisible();
});

/* ---------- The catalog can see what the fleets already hold ---------- */

/**
 * A catalog that starts empty and cannot see the work already done reads as
 * broken. Each tab ends with what the fleets hold and an offer to copy it in.
 */
test('the catalog offers what the fleets already hold', async ({ page }) => {
  await openCatalog(page);
  const catalog = page.getByTestId('catalog');

  // Nothing of its own yet, but the fleet's agents are all on offer.
  await expect(catalog).toContainText('No agents yet');
  const offered = catalog.getByTestId('catalog-fleet-item');
  expect(await offered.count()).toBeGreaterThan(5);
  await expect(catalog.getByTestId('catalog-from-fleets')).toContainText('not in the catalog');

  // And the data tab offers the data library, not the agents.
  await catalog.getByTestId('catalog-tab-dataSource').click();
  await expect(catalog.getByTestId('catalog-fleet-item').first()).toBeVisible();
});

test('copying one in takes it out of the offer and into the catalog', async ({ page }) => {
  await openCatalog(page);
  const catalog = page.getByTestId('catalog');
  await catalog.getByTestId('catalog-tab-dataSource').click();

  const before = await catalog.getByTestId('catalog-fleet-item').count();
  const first = catalog.getByTestId('catalog-fleet-item').first();
  // The row also carries its status and the button; only the name is the name.
  const name = ((await first.locator('.cat-fromfleets-name').textContent()) ?? '').trim();

  await first.getByTestId('catalog-take').click();

  // One fewer on offer, and it is now the catalog's own.
  await expect(catalog.getByTestId('catalog-fleet-item')).toHaveCount(before - 1);
  await expect(catalog.getByTestId('catalog-tab-dataSource')).toContainText('1');
  await expect(catalog.locator('.lib-name').first()).toHaveValue(name);

  // Offering it twice would be how a duplicate gets made.
  await expect(catalog.getByTestId('catalog-fleet-item').filter({ hasText: name })).toHaveCount(0);
});

test('copying an agent in brings the parts it needs', async ({ page }) => {
  await openCatalog(page);
  const catalog = page.getByTestId('catalog');

  // Objektvertrieb is the fleet's busiest agent, so it has parts to bring.
  const row = catalog.getByTestId('catalog-fleet-item').filter({ hasText: 'Objektvertrieb' }).first();
  await row.getByTestId('catalog-take').click();

  // An agent in the catalog whose skills and data are missing would be a shell.
  await expect(catalog.getByTestId('catalog-tab-agents')).toContainText('1');
  await expect(catalog.getByTestId('catalog-tab-dataSource')).not.toContainText('0');
});

test('the fleet menu no longer offers the Library, which has its own tab', async ({ page }) => {
  await page.getByTestId('fleet-menu-toggle').click();
  await expect(page.getByTestId('fleet-menu')).toBeVisible();
  await expect(page.getByTestId('open-library')).toHaveCount(0);
  // The tab beside 2D and 3D is the way in.
  await expect(page.getByTestId('view-library')).toBeVisible();
});

test('the Library is a view, not a dialog over the board', async ({ page }) => {
  await page.getByTestId('view-library').click();

  await expect(page.getByTestId('view-switch')).toHaveAttribute('data-view', 'library');
  await expect(page.getByTestId('library-view')).toHaveAttribute('data-tab', 'data');
  // No scrim: it is a view, so the board is not sitting behind it.
  await expect(page.locator('.dialog-scrim')).toHaveCount(0);
});

test('each tab counts what it holds', async ({ page }) => {
  await page.getByTestId('view-library').click();
  const library = page.getByTestId('library-view');

  const rowsOn = async (tab: string): Promise<number> => {
    await library.getByTestId(`library-tab-${tab}`).click();
    return library.getByTestId('library-row').count();
  };

  const data = await rowsOn('data');
  const tools = await rowsOn('tools');
  const skills = await rowsOn('skills');
  expect(data).toBeGreaterThan(0);
  expect(tools).toBeGreaterThan(0);
  expect(skills).toBeGreaterThan(0);

  await expect(library.getByTestId('library-tab-data')).toContainText(String(data));
  await expect(library.getByTestId('library-tab-tools')).toContainText(String(tools));
  await expect(library.getByTestId('library-tab-skills')).toContainText(String(skills));
});

test('a skill can be added, renamed, edited and deleted', async ({ page }) => {
  await page.getByTestId('view-library').click();
  const library = page.getByTestId('library-view');
  await library.getByTestId('library-tab-skills').click();
  const before = await library.getByTestId('library-row').count();

  await library.getByTestId('library-new-name').fill('Angebots-Pruefung');
  await library.getByTestId('library-add').click();
  await expect(library.getByTestId('library-row')).toHaveCount(before + 1);
  await expect(library.getByTestId('item-rename')).toHaveValue('Angebots-Pruefung');

  // Every field the schema carries is here, not three clicks away.
  await library.getByTestId('skill-instructions').fill('Pruefe jede Position gegen die Preisliste.');
  await library.getByTestId('skill-instructions').blur();
  await library.getByTestId('item-rename').fill('Angebotspruefung');
  await library.getByTestId('item-rename').press('Enter');
  await expect(library.getByTestId('library-row').filter({ hasText: 'Angebotspruefung' })).toHaveCount(
    1,
  );

  // Search narrows the list, and clearing it brings the rest back.
  await library.getByTestId('library-search').fill('Angebotspr');
  await expect(library.getByTestId('library-row')).toHaveCount(1);
  await library.getByTestId('library-search').fill('');
  await expect(library.getByTestId('library-row')).toHaveCount(before + 1);

  await library.getByTestId('library-row').filter({ hasText: 'Angebotspruefung' }).click();
  await library.getByTestId('item-delete').click();
  await library.getByTestId('item-delete-confirm').click();
  await expect(library.getByTestId('library-row')).toHaveCount(before);
});

test('a tool can be added, typed and deleted, and its type filters the list', async ({ page }) => {
  await page.getByTestId('view-library').click();
  const library = page.getByTestId('library-view');
  await library.getByTestId('library-tab-tools').click();
  const before = await library.getByTestId('library-row').count();

  // SPEC 4: every tool explains itself, so the form asks for that too.
  await library.getByTestId('library-new-name').fill('SAP-Abfrage');
  await expect(library.getByTestId('library-add')).toBeDisabled();
  await library.getByTestId('library-new-description').fill('Liest Belege aus SAP.');
  await library.getByTestId('library-add').click();
  await expect(library.getByTestId('library-row')).toHaveCount(before + 1);
  await expect(library.getByTestId('item-rename')).toHaveValue('SAP-Abfrage');

  // The type is the tool's only axis, and it filters.
  await library.getByLabel('Type of SAP-Abfrage').selectOption('python');
  await library.getByTestId('library-tool-type').selectOption('python');
  const pythonOnly = await library.getByTestId('library-row').count();
  expect(pythonOnly).toBeGreaterThan(0);
  expect(pythonOnly).toBeLessThan(before + 1);
  await expect(library.getByTestId('library-row').filter({ hasText: 'SAP-Abfrage' })).toHaveCount(1);

  await library.getByTestId('library-tool-type').selectOption('');
  await expect(library.getByTestId('library-row')).toHaveCount(before + 1);

  await library.getByTestId('library-row').filter({ hasText: 'SAP-Abfrage' }).click();
  await library.getByTestId('item-delete').click();
  await library.getByTestId('item-delete-confirm').click();
  await expect(library.getByTestId('library-row')).toHaveCount(before);
});

test('a tool in use cannot be deleted, and the usage list is shown', async ({ page }) => {
  await page.getByTestId('view-library').click();
  const library = page.getByTestId('library-view');
  await library.getByTestId('library-tab-tools').click();

  await library.getByTestId('library-row').filter({ hasText: 'Dataverse API' }).first().click();
  await expect(library.locator('.ubn').first()).toBeVisible();
  await library.getByTestId('item-delete').click();
  await library.getByTestId('item-delete-confirm').click();
  await expect(library.getByTestId('item-problem')).toContainText('still used by');
});

/* ---------- Data: the model, its filters and its guards ---------- */

/** Open the Library on Data, which is where it opens by default. */
async function openData(page: Page) {
  await page.getByTestId('view-library').click();
  const library = page.getByTestId('library-view');
  await expect(library).toHaveAttribute('data-tab', 'data');
  return library;
}

/** Select a data row by name and return the detail pane. */
async function openItem(page: Page, name: string) {
  const library = page.getByTestId('library-view');
  await library.getByTestId('library-row').filter({ hasText: name }).first().click();
  return library.getByTestId('library-detail');
}

test('data has a source, can be a department, and nests inside other data', async ({ page }) => {
  const library = await openData(page);

  await library.getByTestId('library-new-name').fill('Produktdaten');
  await library.getByTestId('library-add').click();
  await library.getByTestId('data-provider').selectOption('by:Marketing');
  await library.getByLabel('Source of Produktdaten').selectOption('department');
  await expect(library.getByLabel('Status of Produktdaten')).toHaveValue('planned');

  await library.getByTestId('library-new-name').fill('Bilder');
  await library.getByTestId('library-add').click();
  await library.getByTestId('data-parent').selectOption({ label: 'Produktdaten' });
  await expect(library.locator('[data-testid="library-row"][data-depth="1"]')).toHaveCount(1);

  // Provision language, not readiness.
  await expect(library).toContainText('To be provided');

  // Deleting the whole is refused while it still holds a part, and names it.
  await openItem(page, 'Produktdaten');
  await library.getByTestId('item-delete').click();
  await library.getByTestId('item-delete-confirm').click();
  await expect(library.getByTestId('item-problem')).toContainText('still contains');
  await expect(library.getByTestId('item-problem')).toContainText('Bilder');
});

test('the data list filters by state, source and department, composing', async ({ page }) => {
  const library = await openData(page);
  const all = await library.getByTestId('library-row').count();
  expect(all).toBeGreaterThan(2);

  // The chips carry counts, so the answer is visible before the click.
  await expect(library.getByTestId('data-status-all')).toContainText(String(all));

  await library.getByTestId('data-status-live').click();
  const ready = await library.getByTestId('library-row').count();
  expect(ready).toBeGreaterThan(0);
  expect(ready).toBeLessThan(all);

  await library.getByTestId('data-source-filter').selectOption('is:dataverse');
  const both = await library.getByTestId('library-row').count();
  expect(both).toBeLessThanOrEqual(ready);

  await library.getByTestId('data-provider-filter').selectOption('none');
  await expect.poll(async () => library.getByTestId('library-row').count()).toBeLessThanOrEqual(both);

  await library.getByTestId('data-status-all').click();
  await library.getByTestId('data-source-filter').selectOption('');
  await page.getByRole('button', { name: 'Show data from every department again' }).click();
  await expect(library.getByTestId('library-row')).toHaveCount(all);
});

test('the Ansprechpartner belongs to the department, not to each item', async ({ page }) => {
  const library = await openData(page);

  await openItem(page, 'Brand guidelines');
  await library.getByTestId('data-provider').selectOption('by:Marketing');
  await library.getByTestId('data-contact').fill('Herr Klein');
  await library.getByTestId('data-contact').blur();

  // A different item from the same department shows the same name, untyped.
  await openItem(page, 'CRM leads');
  await library.getByTestId('data-provider').selectOption('by:Marketing');
  await expect(library.getByTestId('data-contact')).toHaveValue('Herr Klein');
});

test('a department missing from the list can be added from the dropdown', async ({ page }) => {
  const library = await openData(page);
  await library.getByTestId('library-row').first().click();

  const provider = library.getByTestId('data-provider');
  await expect(provider.locator('option')).not.toContainText(['Einkauf']);

  await provider.selectOption('add');
  await library.getByTestId('provider-add-name').fill('Einkauf');
  await library.getByTestId('provider-add-save').click();
  await expect(provider).toHaveValue('by:Einkauf');

  // The list is the org chart, so it really is a department on the board now.
  await page.getByTestId('view-2d').click();
  await expect(cards(page, 'Einkauf').first()).toBeVisible();
});

test('a data item can be marked linked whatever state it is in', async ({ page }) => {
  const library = await openData(page);
  await library.getByTestId('library-new-name').fill('Kampagnen-Kalender');
  await library.getByTestId('library-add').click();
  await expect(library.getByTestId('library-detail')).toContainText('To be provided');

  const linked = library.getByTestId('data-linked');
  await expect(linked).toBeVisible();
  await linked.check();

  await page.waitForTimeout(600);
  await page.reload();
  await openData(page);
  await openItem(page, 'Kampagnen-Kalender');
  await expect(page.getByTestId('data-linked')).toBeChecked();
});

test('a data item has an undecided source and one place for its link', async ({ page }) => {
  const library = await openData(page);
  await library.getByTestId('library-new-name').fill('Kampagnen-Kalender');
  await library.getByTestId('library-add').click();

  const source = library.getByTestId('data-source');
  await expect(source.locator('option').first()).toHaveText('Not assigned yet');
  await expect(source).toHaveValue('');
  await expect(library.getByTestId('library-detail')).toContainText('not assigned');

  // A path is a reference, so there is nothing to open.
  await library.getByTestId('data-link').fill('sites/marketing/kalender');
  await library.getByTestId('data-link').blur();
  await expect(library.getByTestId('data-link-open')).toHaveCount(0);

  // A URL is somewhere a browser can go, so it gets an Open button.
  await library.getByTestId('data-link').fill('https://solarlux.sharepoint.com/sites/Marketing');
  await library.getByTestId('data-link').blur();
  const open = library.getByTestId('data-link-open');
  await expect(open).toBeVisible();
  await expect(open).toHaveAttribute('href', 'https://solarlux.sharepoint.com/sites/Marketing');
  await expect(open).toHaveAttribute('target', '_blank');

  await page.waitForTimeout(600);
  await page.reload();
  await openData(page);
  await openItem(page, 'Kampagnen-Kalender');
  await expect(page.getByTestId('data-source')).toHaveValue('');
  await expect(page.getByTestId('data-link')).toHaveValue(
    'https://solarlux.sharepoint.com/sites/Marketing',
  );
});

test('data can be added, renamed, nested and deleted, and it all undoes', async ({ page }) => {
  const library = await openData(page);
  const before = await library.getByTestId('library-row').count();

  await library.getByTestId('library-new-name').fill('Produktdaten');
  await library.getByTestId('library-add').click();
  await expect(library.getByTestId('library-row')).toHaveCount(before + 1);
  await expect(library.getByTestId('item-rename')).toHaveValue('Produktdaten');

  // "Add inside" needs no name: it makes a child of what is open.
  await library.getByTestId('data-add-inside').click();
  await expect(library.getByTestId('item-rename')).toHaveValue('New data');
  await library.getByTestId('item-rename').fill('Bilder');
  await library.getByTestId('item-rename').press('Enter');
  await expect(library.locator('[data-testid="library-row"][data-depth="1"]')).toHaveCount(1);

  // An empty name reverts rather than being accepted and lost.
  await library.getByTestId('item-rename').fill('   ');
  await library.getByTestId('item-rename').blur();
  await expect(library.getByTestId('item-rename')).toHaveValue('Bilder');

  await library.getByTestId('item-delete').click();
  await library.getByTestId('item-delete-confirm').click();
  await expect(library.getByTestId('library-row')).toHaveCount(before + 1);

  await page.keyboard.press('Control+z');
  await expect(library.getByTestId('library-row')).toHaveCount(before + 2);
});

test('data an agent depends on cannot be deleted out from under it', async ({ page }) => {
  const library = await openData(page);
  await openItem(page, 'Brand guidelines');
  await expect(library.locator('.ubn').first()).toBeVisible();

  await library.getByTestId('item-delete').click();
  await library.getByTestId('item-delete-confirm').click();
  await expect(library.getByTestId('item-problem')).toContainText('still used by');
  await expect(library.getByTestId('library-row').filter({ hasText: 'Brand guidelines' })).toHaveCount(
    1,
  );
});

test('clicking an agent from the Library leaves for the board', async ({ page }) => {
  await openData(page);
  const detail = await openItem(page, 'Brand guidelines');

  const users = detail.locator('.ubn');
  await expect(users.first()).toBeVisible();
  const name = await users.first().textContent();
  await users.first().click();

  await expect(page.getByTestId('view-switch')).toHaveAttribute('data-view', '2d');
  await expect(page.getByTestId('breadcrumb-here')).toHaveText(name ?? '');
});

test('linking a box gives the agent what is inside it', async ({ page }) => {
  const library = await openData(page);

  await library.getByTestId('library-new-name').fill('Produktdaten');
  await library.getByTestId('library-add').click();
  await library.getByTestId('library-new-name').fill('Bilder');
  await library.getByTestId('library-add').click();
  await library.getByTestId('data-provider').selectOption('by:Marketing');
  await library.getByTestId('data-parent').selectOption({ label: 'Produktdaten' });

  // Link the whole only.
  await page.getByTestId('view-2d').click();
  await cards(page, 'Lead Qualifier').first().click();
  const inspector = page.getByTestId('inspector');
  await inspector.getByRole('button', { name: 'Add data' }).click();
  await page.getByTestId('picker').getByText('Produktdaten', { exact: true }).click();

  // The part came with it, marked as inherited and with no remove button.
  const box = inspector.locator('.chip.ichip', { hasText: 'Produktdaten' });
  const part = inspector.locator('.chip.ichip', { hasText: 'Bilder' });
  await expect(box).toHaveCount(1);
  await expect(part).toHaveAttribute('data-inherited', 'true');
  await expect(part.getByRole('button', { name: 'Remove Bilder' })).toHaveCount(0);
  await expect(box.getByRole('button', { name: 'Remove Produktdaten' })).toHaveCount(1);
});

/* ---------- Making a library item from the agent panel ---------- */

/**
 * A picker that can only offer what exists is a dead end. These cover the other
 * road: type a name that matches nothing, make it, and it is attached AND in the
 * library — one item, not a copy (SPEC 8.7).
 */
test('a skill can be made from the agent panel and lands in the library', async ({ page }) => {
  await cards(page, 'Lead Qualifier').first().click();
  const inspector = page.getByTestId('inspector');

  await inspector.getByRole('button', { name: 'Add skill' }).click();
  const picker = page.getByTestId('picker');
  await picker.getByTestId('picker-search').fill('Angebot prüfen');

  // Nothing matches, so the picker offers to make it.
  await expect(picker.getByTestId('picker-create')).toContainText('New skill “Angebot prüfen”');
  await picker.getByTestId('picker-create').click();

  // Attached to the agent, and the picker is done.
  await expect(page.getByTestId('picker')).toHaveCount(0);
  await expect(inspector.locator('.chip.ichip', { hasText: 'Angebot prüfen' })).toHaveCount(1);

  // And in the library, where every other skill lives.
  await page.getByTestId('view-library').click();
  await page.getByTestId('library-tab-skills').click();
  await expect(
    page.getByTestId('library-row').filter({ hasText: 'Angebot prüfen' }),
  ).toHaveCount(1);
});

test('a tool is asked for its type and description before it can exist', async ({ page }) => {
  await cards(page, 'Lead Qualifier').first().click();
  const inspector = page.getByTestId('inspector');

  await inspector.getByRole('button', { name: 'Add tool' }).click();
  const picker = page.getByTestId('picker');
  await picker.getByTestId('picker-search').fill('Objektportal');
  await picker.getByTestId('picker-create').click();

  // SPEC 4: "every tool explains itself", so the form asks rather than inventing
  // copy. Until it is answered, Create cannot fire.
  const form = picker.getByTestId('picker-form');
  await expect(form).toBeVisible();
  await expect(picker.getByTestId('picker-create-confirm')).toBeDisabled();

  await picker.getByTestId('picker-field-type').selectOption('python');
  await picker.getByTestId('picker-field-description').fill('Liest Bauprojekte aus dem Objektportal.');
  await picker.getByTestId('picker-create-confirm').click();

  await expect(page.getByTestId('picker')).toHaveCount(0);
  await expect(inspector.locator('.chip.ichip', { hasText: 'Objektportal' })).toHaveCount(1);

  // The type it was given is the type it has.
  await page.getByTestId('view-library').click();
  await page.getByTestId('library-tab-tools').click();
  const row = page.getByTestId('library-row').filter({ hasText: 'Objektportal' });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('python script');
});

test('a data source can be made from the agent panel, still to be provided', async ({ page }) => {
  await cards(page, 'Lead Qualifier').first().click();
  const inspector = page.getByTestId('inspector');

  await inspector.getByRole('button', { name: 'Add data' }).click();
  const picker = page.getByTestId('picker');
  await picker.getByTestId('picker-search').fill('Preisliste 2026');
  await picker.getByTestId('picker-create').click();

  await expect(page.getByTestId('picker')).toHaveCount(0);
  await expect(inspector.locator('.chip.ichip', { hasText: 'Preisliste 2026' })).toHaveCount(1);

  // It arrives as work still owed, with nothing decided about where it lives.
  await openData(page);
  await openItem(page, 'Preisliste 2026');
  await expect(page.getByTestId('data-source')).toHaveValue('');
  await expect(page.getByTestId('library-detail')).toContainText('To be provided');
});

test('the picker will not offer to make something already in the library', async ({ page }) => {
  const library = await openData(page);
  await library.getByTestId('library-new-name').fill('Kundenstamm');
  await library.getByTestId('library-add').click();

  await page.getByTestId('view-2d').click();
  await cards(page, 'Lead Qualifier').first().click();
  const inspector = page.getByTestId('inspector');
  await inspector.getByRole('button', { name: 'Add data' }).click();

  const picker = page.getByTestId('picker');
  await picker.getByTestId('picker-search').fill('Kundenstamm');
  // It is in the list, so attaching it is the only thing on offer.
  await expect(picker.getByTestId('picker-create')).toHaveCount(0);
  await expect(picker.locator('.picker-row', { hasText: 'Kundenstamm' })).toHaveCount(1);
});

test('the briefing is offered once the filter says which department', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  const library = await openData(page);

  // Nothing to send while the filter means everybody.
  await expect(library.getByTestId('briefing-copy')).toHaveCount(0);

  await openItem(page, 'Brand guidelines');
  await library.getByTestId('data-provider').selectOption('by:Marketing');
  await library.getByLabel('Requirement for Brand guidelines').fill('Aktuelle Fassung als PDF.');
  await library.getByLabel('Requirement for Brand guidelines').blur();

  await library.getByTestId('data-provider-filter').selectOption('by:Marketing');
  const copy = library.getByTestId('briefing-copy');
  await expect(copy).toContainText('Marketing');
  await copy.click();
  await expect(copy).toHaveText('Copied');

  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Data needed from Marketing');
  expect(text).toContain('Aktuelle Fassung als PDF.');
});

test('the Source list is editable, and a source in use cannot be removed', async ({ page }) => {
  const library = await openData(page);
  await library.getByTestId('source-kinds-open').click();
  const dialog = page.getByTestId('source-kinds');

  // The five the app ships with are listed but not editable.
  await expect(dialog.getByTestId('source-kind')).toHaveCount(5);
  await expect(dialog.getByTestId('source-kind-name')).toHaveCount(0);

  await dialog.getByTestId('source-kind-new').fill('SAP-Belege');
  await dialog.getByTestId('source-kind-add').click();
  await expect(dialog.getByTestId('source-kind')).toHaveCount(6);

  // A name already offered is refused rather than silently duplicated.
  await dialog.getByTestId('source-kind-new').fill('SharePoint');
  await dialog.getByTestId('source-kind-add').click();
  await expect(dialog.getByTestId('source-kinds-error')).toContainText('already a source');

  await dialog.getByRole('button', { name: 'Done' }).click();

  // It is on offer, and using it blocks its removal.
  await library.getByTestId('library-row').first().click();
  await library.getByTestId('data-source').selectOption({ label: 'SAP-Belege' });
  await library.getByTestId('source-kinds-open').click();
  const again = page.getByTestId('source-kinds');
  await again.getByTestId('source-kind-delete').click();
  await expect(again.getByTestId('source-kinds-error')).toContainText('still use this source');
});

/* ---------- Choosing what to export ---------- */

/** The fleet checkboxes only — the catalog is not a fleet. */
function fleetBoxes(dialog: Locator) {
  return dialog.locator('[data-testid^="export-fleet-"]');
}

/** Opens the fleet menu and the export dialog behind it. */
async function openExport(page: Page) {
  await page.getByTestId('fleet-menu-toggle').click();
  await page.getByTestId('open-export').click();
  return page.getByTestId('export-dialog');
}

test('export offers every fleet, and the catalog beside them', async ({ page }) => {
  const before = await fleetBoxes(await openExport(page)).count();
  await page.getByTestId('export-cancel').click();

  // One more fleet is one more row: the dialog lists them all, not just the open one.
  await page.getByTestId('fleet-menu-toggle').click();
  await page.getByTestId('new-company-fleet').click();

  const dialog = await openExport(page);
  await expect(fleetBoxes(dialog)).toHaveCount(before + 1);
  await expect(dialog.getByTestId('export-catalog')).toHaveCount(1);
  // The question this screen exists to answer.
  await expect(dialog).toContainText('A fleet brings its own Data, Tools and Skills with it');

  // It opens on what you were looking at, so exporting one fleet is still one click.
  await expect(fleetBoxes(dialog).filter({ has: page.locator(':checked') })).toHaveCount(0);
  const checked = await dialog.locator('.export-row input:checked').count();
  expect(checked).toBe(1);
  await expect(dialog.getByTestId('export-catalog')).not.toBeChecked();
});

test('nothing ticked means nothing to write', async ({ page }) => {
  const dialog = await openExport(page);
  await dialog.locator('.export-row input:checked').uncheck();

  await expect(dialog.getByTestId('export-nothing')).toBeVisible();
  await expect(dialog.getByTestId('export-confirm')).toBeDisabled();
});

test('select everything ticks every fleet and the catalog', async ({ page }) => {
  await page.getByTestId('fleet-menu-toggle').click();
  await page.getByTestId('new-company-fleet').click();

  const dialog = await openExport(page);
  await dialog.getByTestId('export-all').click();

  const boxes = dialog.locator('.export-row input');
  const total = await boxes.count();
  await expect(dialog.locator('.export-row input:checked')).toHaveCount(total);
  // The button says what it will do, and there is nothing left to select.
  await expect(dialog.getByTestId('export-confirm')).toHaveText('Export everything');
  await expect(dialog.getByTestId('export-all')).toBeDisabled();
});

test('a one-fleet export writes the fleet document it always did', async ({ page }) => {
  const dialog = await openExport(page);
  const download = page.waitForEvent('download');
  await dialog.getByTestId('export-confirm').click();

  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.fleet\.json$/);
  await expect(page.getByTestId('export-dialog')).toHaveCount(0);
});

test('everything goes out as one dated file, and comes back in', async ({ page }) => {
  await page.getByTestId('fleet-menu-toggle').click();
  await page.getByTestId('new-company-fleet').click();

  const dialog = await openExport(page);
  await dialog.getByTestId('export-all').click();
  const download = page.waitForEvent('download');
  await dialog.getByTestId('export-confirm').click();

  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^agent-visualiser-\d{4}-\d{2}-\d{2}\.json$/);

  // And it restores. Every id in the file is already here, so each fleet arrives
  // as a copy rather than overwriting the one it came from.
  const path = await file.path();
  const fleetsBefore = await fleetBoxes(await openExport(page)).count();
  await page.getByTestId('export-cancel').click();

  // As a person does it: the menu is open, because that is where Import lives —
  // and where the summary appears afterwards.
  await page.getByTestId('fleet-menu-toggle').click();
  await page.setInputFiles('input[type="file"][accept*="json"]', path);
  const menu = page.getByTestId('fleet-menu');
  await expect(menu).toContainText('and the catalog');
  await expect(menu).toContainText('came in as copies');

  await page.getByTestId('open-export').click();
  await expect(fleetBoxes(page.getByTestId('export-dialog'))).toHaveCount(fleetsBefore * 2);
});

/* ---------- Reading the agent-data folder ---------- */

/**
 * The directory picker is a native dialog Playwright cannot drive, so the handle
 * it returns is stubbed. Everything after that - the walk, the plan, the preview,
 * the apply and reading a document back out - is the real code path.
 *
 * The files carry real bytes: a `.docx` is a zip, and the reader is only worth
 * testing against one. They are stored rather than deflated, which is a shape zip
 * allows and this keeps the stub short; Word's deflate is covered by the unit
 * suite, which reads the actual documents off disk.
 */
async function stubFolder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type Entry =
      | { kind: 'file'; name: string; getFile: () => Promise<Blob> }
      | {
          kind: 'directory';
          name: string;
          values: () => Entry[];
          getDirectoryHandle: (name: string) => Promise<Entry>;
          getFileHandle: (name: string) => Promise<Entry>;
        };

    /** One stored entry, which is all a reader needs to find the text. */
    const zip = (partName: string, text: string): Uint8Array => {
      const encoder = new TextEncoder();
      const name = encoder.encode(partName);
      const body = encoder.encode(text);

      const local = new Uint8Array(30 + name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint32(18, body.length, true);
      lv.setUint32(22, body.length, true);
      lv.setUint16(26, name.length, true);
      local.set(name, 30);

      const central = new Uint8Array(46 + name.length);
      const cv = new DataView(central.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint32(20, body.length, true);
      cv.setUint32(24, body.length, true);
      cv.setUint16(28, name.length, true);
      central.set(name, 46);

      const eocd = new Uint8Array(22);
      const ev = new DataView(eocd.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(8, 1, true);
      ev.setUint16(10, 1, true);
      ev.setUint32(12, central.length, true);
      ev.setUint32(16, local.length + body.length, true);

      const out = new Uint8Array(local.length + body.length + central.length + eocd.length);
      out.set(local, 0);
      out.set(body, local.length);
      out.set(central, local.length + body.length);
      out.set(eocd, local.length + body.length + central.length);
      return out;
    };

    const file = (name: string, lines: string[] = ['Stand: August 2026']): Entry => ({
      kind: 'file',
      name,
      getFile: () =>
        Promise.resolve(
          new Blob([
            zip(
              'word/document.xml',
              `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${lines
                .map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`)
                .join('')}</w:body></w:document>`,
            ) as BlobPart,
          ]),
        ),
    });

    const plain = (name: string): Entry => ({
      kind: 'file',
      name,
      getFile: () => Promise.resolve(new Blob(['# Arbeitskopie, nicht hochladen'])),
    });

    const named = (children: Entry[], kind: Entry['kind'], name: string): Promise<Entry> => {
      const found = children.find((child) => child.kind === kind && child.name === name);
      return found === undefined ? Promise.reject(new Error('NotFoundError')) : Promise.resolve(found);
    };

    const make = (name: string, children: Entry[]): Entry => ({
      kind: 'directory',
      name,
      values: () => children,
      getDirectoryHandle: (child) => named(children, 'directory', child),
      getFileHandle: (child) => named(children, 'file', child),
    });

    const kern = make('01 Kern', [
      file('Solarlux Unternehmensprofil.docx'),
      file('Solarlux Produktsysteme Register.docx'),
      plain('Solarlux Unternehmensprofil.md'),
    ]);
    const vertrieb = make('02 Vertrieb', [file('Solarlux Vertriebsorganisation.docx')]);
    const objekt = make('Objektvertrieb', [
      file('Objektvertrieb Rollen im Bauprojekt.docx', [
        'Rollen im Bauprojekt',
        'Stand: August 2026',
        'Bauherr, Architekt, Generalunternehmer und Verarbeiter.',
      ]),
    ]);
    const fach = make('03 Fachkontext', [objekt]);
    const upload = make('UPLOAD', [kern, vertrieb, fach]);

    (window as unknown as { showDirectoryPicker: () => Promise<unknown> }).showDirectoryPicker =
      () => Promise.resolve(upload);
  });
}

test('a folder of documents becomes the data library', async ({ page }) => {
  await stubFolder(page);
  await page.goto('/');
  await expect(page.getByTestId('board')).toBeVisible();
  const library = await openData(page);

  const before = await library.getByTestId('library-row').count();
  await library.getByTestId('folder-import').click();

  // A preview first: the folder cannot answer every question.
  const preview = page.getByTestId('import-preview');
  await expect(preview).toContainText('Import UPLOAD');
  await expect(preview.getByTestId('import-box')).toHaveCount(4);
  await expect(preview.getByTestId('import-box').first()).toContainText('ohne Ausnahme');
  await expect(preview).toContainText('Only sales-adjacent agents');
  await expect(preview.getByTestId('import-skipped')).toContainText('1 non-');

  await preview.getByTestId('import-apply').click();
  await expect(preview).toHaveCount(0);

  // Four boxes and four documents, nested under their folders.
  await expect(library.getByTestId('library-row')).toHaveCount(before + 8);
  await expect(library.locator('[data-testid="library-row"][data-depth="2"]').first()).toBeVisible();

  // A document knows where it lives, and reads as existing but not yet linked.
  await openItem(page, 'Rollen im Bauprojekt');
  await expect(library.getByTestId('data-link')).toHaveValue(
    '03 Fachkontext/Objektvertrieb/Objektvertrieb Rollen im Bauprojekt.docx',
  );
  await expect(library.getByTestId('library-detail')).toContainText('Existing');

  // And it is one edit, so it undoes in one step.
  await page.keyboard.press('Control+z');
  await expect(library.getByTestId('library-row')).toHaveCount(before);
});

test('importing the same folder twice refreshes rather than doubles it', async ({ page }) => {
  await stubFolder(page);
  await page.goto('/');
  await expect(page.getByTestId('board')).toBeVisible();
  const library = await openData(page);

  await library.getByTestId('folder-import').click();
  await page.getByTestId('import-apply').click();
  const once = await library.getByTestId('library-row').count();

  await library.getByTestId('folder-import').click();
  await page.getByTestId('import-apply').click();
  await expect(library.getByTestId('library-row')).toHaveCount(once);
});

/* ---------- Reading a document without leaving the library ---------- */

test('an imported document can be read in the library', async ({ page }) => {
  await stubFolder(page);
  await page.goto('/');
  await expect(page.getByTestId('board')).toBeVisible();
  const library = await openData(page);

  await library.getByTestId('folder-import').click();
  await page.getByTestId('import-apply').click();

  await openItem(page, 'Rollen im Bauprojekt');
  const preview = library.getByTestId('document-preview');
  await expect(preview).toContainText('Objektvertrieb Rollen im Bauprojekt.docx');
  await expect(preview).toContainText('as uploaded · read-only');

  // The text itself, read out of the folder rather than copied into the app.
  await expect(library.getByTestId('document-preview-text')).toContainText(
    'Bauherr, Architekt, Generalunternehmer und Verarbeiter.',
  );
  await expect(preview).toContainText('3 paragraphs from UPLOAD/03 Fachkontext/Objektvertrieb/');

  // Moving to another document swaps the text rather than keeping the last one.
  await openItem(page, 'Unternehmensprofil');
  await expect(library.getByTestId('document-preview-text')).toContainText('Stand: August 2026');
  await expect(library.getByTestId('document-preview-text')).not.toContainText('Bauherr');
});

test('a reference that is not a document in the folder shows no reader', async ({ page }) => {
  const library = await openData(page);
  await library.getByTestId('library-new-name').fill('Kundenstamm');
  await library.getByTestId('library-add').click();

  // A Dataverse table is not a file, so there is nothing to read.
  await library.getByTestId('data-link').fill('cr123_kunden');
  await library.getByTestId('data-link').blur();
  await expect(library.getByTestId('document-preview')).toHaveCount(0);

  // Neither is a SharePoint page: that one already has Open.
  await library.getByTestId('data-link').fill('https://solarlux.sharepoint.com/sites/Vertrieb');
  await library.getByTestId('data-link').blur();
  await expect(library.getByTestId('document-preview')).toHaveCount(0);
  await expect(library.getByTestId('data-link-open')).toBeVisible();
});

test('a document says it needs the folder open, and says when it is missing', async ({ page }) => {
  await stubFolder(page);
  await page.goto('/');
  await expect(page.getByTestId('board')).toBeVisible();
  const library = await openData(page);

  await library.getByTestId('library-new-name').fill('Preisliste');
  await library.getByTestId('library-add').click();
  await library.getByTestId('data-link').fill('01 Kern/Preisliste 2026.docx');
  await library.getByTestId('data-link').blur();

  // No folder opened yet: the reference is all the library has, and it says so.
  await expect(library.getByTestId('document-preview-closed')).toContainText('Open folder to read');

  // With the folder open, a path that is not in it is named rather than blank.
  await library.getByTestId('folder-import').click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(library.getByTestId('document-preview-error')).toContainText(
    'No file at 01 Kern/Preisliste 2026.docx',
  );

  // And one that is in it reads.
  await library.getByTestId('data-link').fill('01 Kern/Solarlux Unternehmensprofil.docx');
  await library.getByTestId('data-link').blur();
  await expect(library.getByTestId('document-preview-text')).toContainText('Stand: August 2026');
});

test('a fresh install opens the Solarlux Vision fleet, not the demo', async ({ browser }) => {
  const context = await browser.newContext();
  const fresh = await context.newPage();
  await fresh.addInitScript(() => {
    indexedDB.deleteDatabase('agent-fleet-studio');
  });
  await fresh.goto('/');

  await expect(fresh.getByTestId('breadcrumb')).toContainText('Solarlux Vision');
  // Fifteen agents, and the shared deck builder drawn under both its parents.
  await expect(fresh.getByTestId('agent-card')).toHaveCount(16);
  await expect(fresh.getByTestId('agent-card').filter({ hasText: 'Controlling' })).toHaveCount(1);

  await context.close();
});
