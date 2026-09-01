/**
 * SPEC 5.10 + 8.3 - the search brain.
 *
 * Weighted fielded fuzzy matching over name (highest), role, skills, tools
 * (+ type labels), data (+ type/status), kind and status; multi-token AND; typo
 * tolerance via Fuse.js; DE-EN synonyms; and a match reason per result.
 *
 * Multi-token AND is done here rather than with Fuse's extended syntax: every
 * token must hit something, and each token is expanded through the synonym table
 * first, which Fuse cannot express on its own.
 */
import Fuse from 'fuse.js';
import type { IFuseOptions } from 'fuse.js';
import { DATA_SOURCE_STATUS_LABELS, STATUS_LABELS } from '../model/schemas.js';
import type { Agent, Fleet } from '../model/schemas.js';
import { KIND_LABEL, SHARED_KIND_LABEL, TOOL_TYPE_LABEL } from '../ui/palette.js';
import { isShared } from '../model/selectors.js';
import { expandToken } from './synonyms.js';

/** Which field a hit came from - shown as the result's match reason. */
export type MatchField = 'name' | 'role' | 'skills' | 'tools' | 'data' | 'kind' | 'status';

export const MATCH_LABEL: Record<MatchField, string> = {
  name: 'name',
  role: 'role',
  skills: 'skill',
  tools: 'tool',
  data: 'data source',
  kind: 'kind',
  status: 'status',
};

type SearchDoc = {
  id: string;
  name: string;
  role: string;
  skills: string;
  tools: string;
  data: string;
  kind: string;
  status: string;
};

export type SearchResult = {
  agent: Agent;
  /** Lower is better, Fuse-style. */
  score: number;
  field: MatchField;
};

/** SPEC 5.10: name highest, then role, then the rest. */
const KEYS: { name: MatchField; weight: number }[] = [
  { name: 'name', weight: 1 },
  { name: 'role', weight: 0.55 },
  { name: 'skills', weight: 0.35 },
  { name: 'tools', weight: 0.35 },
  { name: 'data', weight: 0.3 },
  { name: 'kind', weight: 0.2 },
  { name: 'status', weight: 0.2 },
];

/**
 * Fuse's weighted score is not comparable between queries - a perfect hit in the
 * low-weighted `tools` field scores ~0.62 while a perfect name hit scores 0. So
 * relevance is judged RELATIVELY: keep the best hit for a token and everything
 * within this window of it, and drop the long tail. Without this, "planned" also
 * returned an agent whose only connection was a fuzzy brush against "template".
 */
const RELEVANCE_WINDOW = 0.35;

const FUSE_OPTIONS: IFuseOptions<SearchDoc> = {
  keys: KEYS,
  includeScore: true,
  includeMatches: true,
  // Typo tolerance (SPEC 5.10) without matching everything.
  threshold: 0.38,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

export type SearchIndex = {
  fuse: Fuse<SearchDoc>;
  agentsById: Map<string, Agent>;
};

export function buildSearchIndex(fleet: Fleet): SearchIndex {
  const skillsById = new Map(fleet.skills.map((s) => [s.id, s]));
  const toolsById = new Map(fleet.tools.map((t) => [t.id, t]));
  const dataById = new Map(fleet.dataSources.map((d) => [d.id, d]));

  const docs: SearchDoc[] = fleet.agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    skills: agent.skillIds
      .map((id) => skillsById.get(id))
      .filter((s) => s !== undefined)
      .map((s) => s.name)
      .join(' '),
    tools: agent.toolIds
      .map((id) => toolsById.get(id))
      .filter((t) => t !== undefined)
      .map((t) => `${t.name} ${TOOL_TYPE_LABEL[t.type]}`)
      .join(' '),
    data: agent.dataSourceIds
      .map((id) => dataById.get(id))
      .filter((d) => d !== undefined)
      .map((d) => `${d.name} ${d.type} ${DATA_SOURCE_STATUS_LABELS[d.status]}`)
      .join(' '),
    // Shared-ness is derived, so "shared" has to be searchable text (SPEC 8.3).
    kind: `${KIND_LABEL[agent.kind]}${isShared(fleet, agent.id) ? ` ${SHARED_KIND_LABEL} shared` : ''}`,
    status: STATUS_LABELS[agent.status],
  }));

  return {
    fuse: new Fuse(docs, FUSE_OPTIONS),
    agentsById: new Map(fleet.agents.map((a) => [a.id, a])),
  };
}

type TokenHit = { score: number; field: MatchField };

/** Best hit per agent for one token, after synonym expansion. */
function searchToken(index: SearchIndex, token: string): Map<string, TokenHit> {
  const best = new Map<string, TokenHit>();

  expandToken(token).forEach((term, termIndex) => {
    // A synonym match is a slightly weaker signal than the word the user typed.
    const penalty = termIndex === 0 ? 0 : 0.15;

    for (const hit of index.fuse.search(term)) {
      const score = (hit.score ?? 1) + penalty;
      const field = (hit.matches?.[0]?.key ?? 'name') as MatchField;
      const current = best.get(hit.item.id);
      if (!current || score < current.score) best.set(hit.item.id, { score, field });
    }
  });

  if (best.size === 0) return best;

  const strongest = Math.min(...[...best.values()].map((hit) => hit.score));
  const cutoff = strongest + RELEVANCE_WINDOW;
  return new Map([...best].filter(([, hit]) => hit.score <= cutoff));
}

/**
 * SPEC 5.10: multi-token AND. Every token must match; the reported field is the
 * strongest hit across tokens, with `name` always winning ties so results read
 * sensibly.
 */
export function searchFleet(index: SearchIndex, query: string, limit = 6): SearchResult[] {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  let surviving: Map<string, { score: number; field: MatchField }> | null = null;

  for (const token of tokens) {
    const hits = searchToken(index, token);
    if (hits.size === 0) return [];

    if (surviving === null) {
      surviving = new Map([...hits].map(([id, hit]) => [id, { ...hit }]));
      continue;
    }

    const next = new Map<string, { score: number; field: MatchField }>();
    for (const [id, carried] of surviving) {
      const hit = hits.get(id);
      if (!hit) continue;
      next.set(id, {
        score: carried.score + hit.score,
        field: carried.field === 'name' || hit.field !== 'name' ? carried.field : hit.field,
      });
    }
    surviving = next;
    if (surviving.size === 0) return [];
  }

  if (surviving === null) return [];

  return [...surviving]
    .map(([id, hit]) => {
      const agent = index.agentsById.get(id);
      return agent ? { agent, score: hit.score, field: hit.field } : null;
    })
    .filter((result) => result !== null)
    .sort((a, b) => a.score - b.score || a.agent.name.localeCompare(b.agent.name))
    .slice(0, limit);
}
