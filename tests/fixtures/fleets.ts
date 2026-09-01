/**
 * A hand-written fleet that exercises every structural feature of SPEC 4 at once:
 * an orchestrator, two departments, a SHARED worker with two parents, a child BELOW
 * that shared worker (the case SPEC 4 says must repeat under every parent instance),
 * a peer link, and all three library kinds.
 *
 *   orchestrator
 *   |- sales ------- quotes* --- pricing
 *   |- operations -- quotes* --- pricing      (* the same agent, shared)
 *   |- sales ------- leads
 *   leads <--peer--> operations
 */
import { SCHEMA_VERSION } from '../../src/model/schemas.js';
import type { Fleet } from '../../src/model/schemas.js';

export const AGENT = {
  orchestrator: 'agt_orchestrator',
  sales: 'agt_sales',
  operations: 'agt_operations',
  quotes: 'agt_quotes',
  pricing: 'agt_pricing',
  leads: 'agt_leads',
} as const;

export const EDGE = {
  orchToSales: 'edg_orch_sales',
  orchToOps: 'edg_orch_ops',
  salesToQuotes: 'edg_sales_quotes',
  opsToQuotes: 'edg_ops_quotes',
  quotesToPricing: 'edg_quotes_pricing',
  salesToLeads: 'edg_sales_leads',
  leadsPeerOps: 'edg_leads_peer_ops',
} as const;

export const LIB = {
  skill: 'skl_negotiation',
  tool: 'tol_quote_flow',
  dataSource: 'dsr_price_list',
} as const;

/** Deep-cloned on every call so a mutating test cannot leak into the next one. */
export function makeFleet(): Fleet {
  const fleet: Fleet = {
    schemaVersion: SCHEMA_VERSION,
    id: 'flt_demo',
    name: 'Fixture fleet',
    agents: [
      {
        id: AGENT.orchestrator,
        kind: 'orchestrator',
        name: 'Orchestrator',
        role: 'Routes work across the fleet',
        status: 'live',
        skillIds: [],
        toolIds: [],
        dataSourceIds: [],
      },
      {
        id: AGENT.sales,
        kind: 'department',
        name: 'Sales',
        role: 'Owns the pipeline',
        status: 'live',
        skillIds: [LIB.skill],
        toolIds: [],
        dataSourceIds: [],
      },
      {
        id: AGENT.operations,
        kind: 'department',
        name: 'Operations',
        role: 'Owns delivery',
        status: 'building',
        skillIds: [],
        toolIds: [],
        dataSourceIds: [],
      },
      {
        id: AGENT.quotes,
        kind: 'worker',
        name: 'Quote builder',
        role: 'Assembles quotes',
        status: 'building',
        skillIds: [LIB.skill],
        toolIds: [LIB.tool],
        dataSourceIds: [LIB.dataSource],
      },
      {
        id: AGENT.pricing,
        kind: 'worker',
        name: 'Pricing check',
        role: 'Validates margins',
        status: 'planned',
        skillIds: [],
        toolIds: [],
        dataSourceIds: [LIB.dataSource],
      },
      {
        id: AGENT.leads,
        kind: 'worker',
        name: 'Lead qualifier',
        role: 'Scores inbound leads',
        status: 'planned',
        skillIds: [],
        toolIds: [],
        dataSourceIds: [],
      },
    ],
    edges: [
      { id: EDGE.orchToSales, source: AGENT.orchestrator, target: AGENT.sales, kind: 'hierarchy', status: 'live' },
      { id: EDGE.orchToOps, source: AGENT.orchestrator, target: AGENT.operations, kind: 'hierarchy', status: 'live' },
      { id: EDGE.salesToQuotes, source: AGENT.sales, target: AGENT.quotes, kind: 'hierarchy', status: 'building' },
      { id: EDGE.opsToQuotes, source: AGENT.operations, target: AGENT.quotes, kind: 'hierarchy', status: 'planned' },
      { id: EDGE.quotesToPricing, source: AGENT.quotes, target: AGENT.pricing, kind: 'hierarchy', status: 'planned' },
      { id: EDGE.salesToLeads, source: AGENT.sales, target: AGENT.leads, kind: 'hierarchy', status: 'planned' },
      {
        id: EDGE.leadsPeerOps,
        source: AGENT.leads,
        target: AGENT.operations,
        kind: 'peer',
        status: 'planned',
        label: 'hands off to',
      },
    ],
    skills: [
      { id: LIB.skill, name: 'Negotiation', description: 'Frames commercial trade-offs' },
    ],
    tools: [
      {
        id: LIB.tool,
        name: 'Quote flow',
        description: 'Builds a quote document from a configuration',
        type: 'workflow',
        workflow: {
          steps: [
            { id: 'stp_start', name: 'Request received', kind: 'trigger', next: ['stp_check'] },
            { id: 'stp_check', name: 'Margin ok?', kind: 'condition', next: ['stp_send', 'stp_escalate'] },
            { id: 'stp_send', name: 'Send quote', kind: 'action', next: [] },
            { id: 'stp_escalate', name: 'Escalate to sales lead', kind: 'action', next: [] },
          ],
        },
      },
    ],
    dataSources: [
      { id: LIB.dataSource, name: 'Price list', type: 'sharepoint', status: 'live', linked: true, ref: 'sites/sales/prices' },
    ],
  };

  return structuredClone(fleet);
}
