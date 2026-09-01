/**
 * SPEC 6 colour tokens, in TypeScript for the places that cannot read CSS
 * variables: SVG stroke attributes, canvas labels and the three.js materials.
 * `tokens.css` holds the same values for the CSS side - both come from the
 * prototype's `CSS_COLOR` / `SCOL` / `TCOL` / `DCOL` tables.
 */
import type { AgentKind, DataSourceType, Status, ToolType } from '../model/schemas.js';

export const KIND_COLOR: Record<AgentKind, string> = {
  orchestrator: '#8b5cf6',
  department: '#38e1ff',
  worker: '#3ce8b0',
};

/** Shared agents are accented amber wherever their shared-ness is shown (SPEC 5.3). */
export const SHARED_COLOR = '#f6b954';

export const STATUS_COLOR: Record<Status, string> = {
  live: '#4ade80',
  building: '#fbbf24',
  planned: '#6b7a9e',
};

export const TOOL_TYPE_COLOR: Record<ToolType, string> = {
  workflow: '#f6b954',
  python: '#38e1ff',
  microsoft: '#818cf8',
};

/** The prototype's `TLBL` - what a tool's type chip reads. */
export const TOOL_TYPE_LABEL: Record<ToolType, string> = {
  workflow: 'workflow',
  python: 'python script',
  microsoft: 'microsoft tool',
};

export const DATA_TYPE_COLOR: Record<DataSourceType, string> = {
  md: '#c9b6ff',
  dataverse: '#3ce8b0',
  sharepoint: '#38e1ff',
};

/** Panel kind chip text (`KIND_LABEL`). */
export const KIND_LABEL: Record<AgentKind, string> = {
  orchestrator: 'Orchestrator',
  department: 'Department',
  worker: 'Sub-agent',
};

export const SHARED_KIND_LABEL = 'Shared agent';

/** Numeric form of the kind colours, for three.js. */
export const KIND_COLOR_HEX: Record<AgentKind, number> = {
  orchestrator: 0x8b5cf6,
  department: 0x38e1ff,
  worker: 0x3ce8b0,
};

export const SKILL_COLOR = '#9bb8ff';
