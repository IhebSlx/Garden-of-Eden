/**
 * View state (SPEC §2: out of the undo history, out of the persisted document).
 * These pin the behaviours the board and the 3D scene both depend on.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { sectionKey, matchesFilter, useUiStore } from '../../src/store/uiStore.js';
import { useFleetStore } from '../../src/store/fleetStore.js';

const ui = () => useUiStore.getState();

beforeEach(() => {
  useUiStore.setState({
    view: '2d',
    morph: null,
    focusId: null,
    selectedId: null,
    selectedEdgeId: null,
    statusFilter: null,
    searchQuery: '',
    showDetails: false,
    openDetail: null,
    focusStartedAt: 0,
    libraryTab: 'data',
    shortcutsOpen: false,
    fitRequest: 0,
    burst: null,
    openSections: {},
  });
});

describe('activate (SPEC 5.2, 5.9)', () => {
  it('focuses, selects and fires the burst in one action', () => {
    ui().activate('agt_a');
    expect(ui().focusId).toBe('agt_a');
    expect(ui().selectedId).toBe('agt_a');
    expect(ui().burst?.agentId).toBe('agt_a');
    expect(ui().focusStartedAt).toBeGreaterThan(0);
  });

  it('does not replay the focus cascade when the same agent is clicked again', () => {
    ui().activate('agt_a');
    const startedAt = ui().focusStartedAt;
    const firstBurst = ui().burst?.at ?? 0;

    ui().activate('agt_a');
    // The cascade must not restart (it would swallow a double-click to rename)...
    expect(ui().focusStartedAt).toBe(startedAt);
    // ...but the click still gets its burst.
    expect(ui().burst?.at).toBeGreaterThanOrEqual(firstBurst);
  });

  it('does restart the cascade when focus moves to a different agent', () => {
    ui().activate('agt_a');
    const startedAt = ui().focusStartedAt;
    ui().activate('agt_b');
    expect(ui().focusStartedAt).not.toBe(startedAt);
  });

  it('clears any selected edge', () => {
    ui().selectEdge('edg_1');
    ui().activate('agt_a');
    expect(ui().selectedEdgeId).toBeNull();
  });
});

describe('focus and selection', () => {
  it('clearFocus drops focus, selection and any open detail', () => {
    ui().activate('agt_a');
    ui().toggleDetail('tool:tol_1');
    ui().clearFocus();

    expect(ui().focusId).toBeNull();
    expect(ui().selectedId).toBeNull();
    expect(ui().openDetail).toBeNull();
  });

  it('selecting an edge closes the agent panel, and vice versa', () => {
    ui().select('agt_a');
    ui().selectEdge('edg_1');
    expect(ui().selectedId).toBeNull();
    expect(ui().selectedEdgeId).toBe('edg_1');

    ui().select('agt_b');
    expect(ui().selectedEdgeId).toBeNull();
  });
});

describe('status filter (SPEC 5.6)', () => {
  it('clicking a status sets it, clicking it again clears it', () => {
    ui().toggleStatusFilter('live');
    expect(ui().statusFilter).toBe('live');
    ui().toggleStatusFilter('live');
    expect(ui().statusFilter).toBeNull();
  });

  it('switching straight to another status replaces it', () => {
    ui().toggleStatusFilter('live');
    ui().toggleStatusFilter('planned');
    expect(ui().statusFilter).toBe('planned');
  });

  it('"All" always clears', () => {
    ui().toggleStatusFilter('building');
    ui().toggleStatusFilter(null);
    expect(ui().statusFilter).toBeNull();
  });

  it('matchesFilter passes everything when no filter is set', () => {
    expect(matchesFilter('planned', null)).toBe(true);
    expect(matchesFilter('planned', 'live')).toBe(false);
    expect(matchesFilter('live', 'live')).toBe(true);
  });
});

describe('detail cards (SPEC 5.7)', () => {
  it('clicking the same item again closes it', () => {
    ui().toggleDetail('skill:skl_1');
    expect(ui().openDetail).toBe('skill:skl_1');
    ui().toggleDetail('skill:skl_1');
    expect(ui().openDetail).toBeNull();
  });

  it('clicking a different item swaps the detail', () => {
    ui().toggleDetail('skill:skl_1');
    ui().toggleDetail('tool:tol_1');
    expect(ui().openDetail).toBe('tool:tol_1');
  });
});

describe('view switching and morph (SPEC 5.1, 8.2)', () => {
  it('records a morph when the view changes', () => {
    ui().setView('3d');
    expect(ui().view).toBe('3d');
    expect(ui().morph).toMatchObject({ from: '2d', to: '3d' });
  });

  it('ignores a switch to the view already showing', () => {
    ui().setView('2d');
    expect(ui().morph).toBeNull();
  });

  it('endMorph clears the transition', () => {
    ui().setView('3d');
    ui().endMorph();
    expect(ui().morph).toBeNull();
    expect(ui().view).toBe('3d');
  });

  it('toggleView flips and records a morph', () => {
    ui().toggleView();
    expect(ui().view).toBe('3d');
    ui().toggleView();
    expect(ui().view).toBe('2d');
  });

  it('keeps focus, selection, filter and search across the switch (SPEC 5.1)', () => {
    ui().activate('agt_a');
    ui().toggleStatusFilter('live');
    ui().setSearchQuery('angebot');

    ui().setView('3d');

    expect(ui().focusId).toBe('agt_a');
    expect(ui().selectedId).toBe('agt_a');
    expect(ui().statusFilter).toBe('live');
    expect(ui().searchQuery).toBe('angebot');
  });
});

describe('fleet-scoped resets', () => {
  it('resetForFleet clears everything that belonged to the old fleet', () => {
    ui().activate('agt_a');
    ui().setSearchQuery('lead');
    ui().selectEdge('edg_1');
    ui().resetForFleet();

    expect(ui().focusId).toBeNull();
    expect(ui().selectedId).toBeNull();
    expect(ui().selectedEdgeId).toBeNull();
    expect(ui().searchQuery).toBe('');
    expect(ui().burst).toBeNull();
  });

  it('leaves the view and the filter alone - those are the user\'s, not the fleet\'s', () => {
    ui().setView('3d');
    ui().toggleStatusFilter('planned');
    ui().resetForFleet();

    expect(ui().view).toBe('3d');
    expect(ui().statusFilter).toBe('planned');
  });
});

describe('modal and fit requests', () => {
  it('opens the Library view on a tab, and the shortcut sheet', () => {
    ui().openLibrary('tools');
    expect(ui().view).toBe('library');
    expect(ui().libraryTab).toBe('tools');
    // No argument keeps whichever tab was last open.
    ui().setView('2d');
    ui().openLibrary();
    expect(ui().libraryTab).toBe('tools');

    ui().openShortcuts();
    expect(ui().shortcutsOpen).toBe(true);
    ui().closeShortcuts();
    expect(ui().shortcutsOpen).toBe(false);
  });

  it('requestFit bumps a counter the board can watch', () => {
    const before = ui().fitRequest;
    ui().requestFit();
    ui().requestFit();
    expect(ui().fitRequest).toBe(before + 2);
  });
});

describe('collapsible card sections', () => {
  it('starts every section collapsed, so a busy card stays readable', () => {
    expect(ui().openSections).toEqual({});
  });

  it('opens and closes one section at a time', () => {
    ui().toggleDetailSection('agt_1', 'tools');
    expect(ui().openSections[sectionKey('agt_1', 'tools')]).toBe(true);
    expect(ui().openSections[sectionKey('agt_1', 'skills')]).toBeUndefined();

    ui().toggleDetailSection('agt_1', 'tools');
    expect(ui().openSections[sectionKey('agt_1', 'tools')]).toBeUndefined();
  });

  it('keys by agent, so every instance of a shared agent opens together', () => {
    // SPEC 2.3: one agent, many instances - they must not disagree.
    expect(sectionKey('agt_7', 'data')).toBe('agt_7|data');
  });

  it('keeps sections out of the fleet document and its undo history', () => {
    // SPEC 2: view state lives here precisely so undo cannot reach it.
    ui().toggleDetailSection('agt_1', 'data');
    expect(Object.keys(useUiStore.getState())).toContain('openSections');
    expect(useFleetStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it('forgets open sections when a different fleet is loaded', () => {
    ui().toggleDetailSection('agt_1', 'skills');
    ui().resetForFleet();
    expect(ui().openSections).toEqual({});
  });
});
