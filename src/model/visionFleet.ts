/**
 * The Solarlux target architecture, from `agenten_02_vision.pdf` / `.svg`
 * (Mid Term Presentation), loadable as an example fleet.
 *
 * Statuses come from the companion `agenten_01_heute.svg`, whose legend is exactly
 * this app's roadmap vocabulary (SPEC 5.6):
 *   produktiv              -> live
 *   in Arbeit              -> building
 *   fehlt / nicht verknüpft -> planned, and `linked: false` on the data source
 *
 * So the board reads as a roadmap: Objektvertrieb is running today, PPTX-Creator is
 * being built, and everything the vision adds on top is still Planned.
 *
 * "Sorakel" is the external company LLM the vision puts behind the orchestrator via
 * an API, so it is modelled as the orchestrator's `model`, not as an agent.
 * "Dataverse & SharePoint" is the shared substrate rather than an agent, so it is
 * modelled as tools every agent draws on.
 */
import { SCHEMA_VERSION } from './schemas.js';
import type { Agent, DataSource, Edge, Fleet, Skill, Tool } from './schemas.js';

const skills: Skill[] = [
  { id: 'vskl_intent', name: 'Intent-Routing', description: 'Versteht die Frage und wählt den passenden Fachagenten.' },
  { id: 'vskl_projektstatus', name: 'Projektstatus', description: 'Liest Projekte, Status und Belege zusammen.' },
  { id: 'vskl_belege', name: 'Belegprüfung', description: 'Findet und prüft Belege zu einem Bauprojekt.' },
  { id: 'vskl_slides', name: 'Slide-Bausteine', description: 'Setzt Präsentationen aus freigegebenen Bausteinen zusammen.' },
  { id: 'vskl_produktwissen', name: 'Produktwissen', description: 'Kennt Produktfamilien und passende Bilder.' },
  { id: 'vskl_qa', name: 'Q&A', description: 'Beantwortet Fragen aus einer Wissensquelle mit Beleg.' },
  { id: 'vskl_marktanalyse', name: 'Marktanalyse', description: 'Bewertet Markt, Wettbewerb und Chancen.' },
  { id: 'vskl_icp', name: 'ICP-Bewertung', description: 'Prüft Leads gegen das Zielkundenprofil.' },
];

const tools: Tool[] = [
  {
    id: 'vtol_dataverse',
    name: 'Dataverse',
    description: 'Gemeinsamer Unterbau: Tabellen, Berechtigungen und Datenzugriff für alle Agenten.',
    type: 'microsoft',
  },
  {
    id: 'vtol_sharepoint',
    name: 'SharePoint',
    description: 'Gemeinsamer Unterbau: Dokumente, Sites und Berechtigungen für alle Agenten.',
    type: 'microsoft',
  },
  {
    id: 'vtol_flows',
    name: 'Power Automate Flows',
    description: 'Gemeinsamer Unterbau: Flows, die Agenten als Werkzeuge aufrufen.',
    type: 'workflow',
    workflow: {
      steps: [
        { id: 'vstp_flow_0', name: 'Agent ruft Flow auf', kind: 'trigger', next: ['vstp_flow_1'] },
        { id: 'vstp_flow_1', name: 'Berechtigung prüfen', kind: 'condition', next: ['vstp_flow_2', 'vstp_flow_3'] },
        { id: 'vstp_flow_2', name: 'Daten lesen oder schreiben', kind: 'action', next: ['vstp_flow_4'] },
        { id: 'vstp_flow_3', name: 'Zugriff ablehnen', kind: 'action', next: [] },
        { id: 'vstp_flow_4', name: 'Ergebnis an den Agenten', kind: 'action', next: [] },
      ],
    },
  },
  {
    id: 'vtol_crm',
    name: 'Dynamics CRM',
    description: 'Liest Projekte, Konten und Aktivitäten aus dem CRM.',
    type: 'microsoft',
  },
  {
    id: 'vtol_pptx',
    name: 'PPTX-Engine',
    description: 'Baut eine Präsentation aus Bausteinen im Corporate Design.',
    type: 'workflow',
    workflow: {
      steps: [
        { id: 'vstp_pptx_0', name: 'Outline erhalten', kind: 'trigger', next: ['vstp_pptx_1'] },
        { id: 'vstp_pptx_1', name: 'Bausteine wählen', kind: 'action', next: ['vstp_pptx_2'] },
        { id: 'vstp_pptx_2', name: 'Produktbilder einsetzen', kind: 'action', next: ['vstp_pptx_3'] },
        { id: 'vstp_pptx_3', name: '.pptx zurückgeben', kind: 'action', next: [] },
      ],
    },
  },
  {
    id: 'vtol_marktdaten',
    name: 'Marktdaten-Anreicherung',
    description: 'Reichert Leads und Konten mit externen Marktdaten an.',
    type: 'python',
  },
];

const dataSources: DataSource[] = [
  // Orchestrator-only knowledge (the vision marks it "nur für den Orchestrator").
  {
    id: 'vdsr_unternehmenswissen',
    name: 'Allgemeines Unternehmenswissen',
    type: 'sharepoint',
    status: 'planned',
    ref: 'Richtlinien, Prozesse, Struktur',
  },
  // "Kontext für alle" - shared by every agent in the vision.
  {
    id: 'vdsr_unternehmenskontext',
    name: 'Unternehmenskontext',
    type: 'md',
    status: 'planned',
    ref: 'wer wir sind, was wir bauen, wie wir sprechen',
  },
  // Objektvertrieb runs today, so its sources are Ready and linked...
  { id: 'vdsr_crm', name: 'Dynamics CRM', type: 'dataverse', status: 'live', linked: true },
  { id: 'vdsr_objektportal', name: 'Objektportal', type: 'sharepoint', status: 'live', linked: true },
  { id: 'vdsr_sap', name: 'SAP-Belege', type: 'dataverse', status: 'live', linked: true },
  // ...except Bauprojekt-Sites, which "heute" shows as in Arbeit.
  { id: 'vdsr_bauprojekte', name: 'Bauprojekt-Sites', type: 'sharepoint', status: 'building' },
  // PPTX-Creator's sources are "fehlt / nicht verknüpft" today.
  { id: 'vdsr_produktbilder', name: 'Produktbilder, gelabelt', type: 'sharepoint', status: 'planned', linked: false },
  { id: 'vdsr_produktwissen', name: 'Produktwissen', type: 'md', status: 'planned', linked: false },
  // Vision-only sources.
  { id: 'vdsr_holzoffensive', name: 'SharePoint Holzoffensive', type: 'sharepoint', status: 'planned' },
  { id: 'vdsr_marktdaten', name: 'Marktdaten / Anreicherung', type: 'dataverse', status: 'planned' },
  { id: 'vdsr_icp', name: 'Zielkundenprofil (ICP)', type: 'md', status: 'planned' },
];

const SUBSTRATE = ['vtol_dataverse', 'vtol_sharepoint', 'vtol_flows'];

const agents: Agent[] = [
  {
    id: 'vagt_orchestrator',
    kind: 'orchestrator',
    name: 'Orchestrator',
    role: 'Einzige Anlaufstelle — versteht die Frage, wählt den passenden Fachagenten',
    // Not built yet: today there is no orchestrator, only single agents.
    status: 'planned',
    instructions:
      'Verstehe die Frage, wähle den passenden Fachagenten und gib den vollen Kontext weiter. Beantworte Fachfragen nie selbst.',
    // "Sorakel — externes Unternehmens-LLM", reached over an API in the vision.
    model: { provider: 'Sorakel', name: 'externes Unternehmens-LLM' },
    skillIds: ['vskl_intent'],
    toolIds: [...SUBSTRATE],
    dataSourceIds: ['vdsr_unternehmenswissen', 'vdsr_unternehmenskontext'],
  },
  {
    id: 'vagt_objektvertrieb',
    kind: 'department',
    name: 'Objektvertrieb',
    role: 'Projekte, Status, Belege',
    // PRODUKTIV in agenten_01_heute.
    status: 'live',
    instructions:
      'Qualifiziere jedes Bauprojekt, bevor Angebote entstehen. Belege jede Aussage mit der Quelle.',
    skillIds: ['vskl_projektstatus', 'vskl_belege'],
    toolIds: [...SUBSTRATE, 'vtol_crm'],
    dataSourceIds: ['vdsr_crm', 'vdsr_objektportal', 'vdsr_sap', 'vdsr_bauprojekte', 'vdsr_unternehmenskontext'],
  },
  {
    id: 'vagt_pptx',
    kind: 'department',
    name: 'PPTX-Creator',
    role: 'Präsentationen aus Bausteinen',
    // IN ARBEIT in agenten_01_heute.
    status: 'building',
    instructions: 'Nutze immer das Corporate Template. Eine Aussage pro Folie.',
    skillIds: ['vskl_slides', 'vskl_produktwissen'],
    toolIds: [...SUBSTRATE, 'vtol_pptx'],
    dataSourceIds: ['vdsr_produktbilder', 'vdsr_produktwissen', 'vdsr_unternehmenskontext'],
  },
  {
    id: 'vagt_holzoffensive',
    kind: 'department',
    name: 'Holzoffensive Buddy',
    role: 'Q&A zur Holzoffensive',
    status: 'planned',
    instructions: 'Antworte nur aus der Holzoffensive-Quelle und nenne immer die Fundstelle.',
    skillIds: ['vskl_qa'],
    toolIds: [...SUBSTRATE],
    dataSourceIds: ['vdsr_holzoffensive', 'vdsr_unternehmenskontext'],
  },
  {
    id: 'vagt_businessdev',
    kind: 'department',
    name: 'Business Development',
    role: 'Markt, Leads, ICP',
    status: 'planned',
    instructions: 'Belege Marktaussagen mit mindestens zwei unabhängigen Quellen.',
    skillIds: ['vskl_marktanalyse', 'vskl_icp'],
    toolIds: [...SUBSTRATE, 'vtol_marktdaten'],
    dataSourceIds: ['vdsr_marktdaten', 'vdsr_icp', 'vdsr_unternehmenskontext'],
  },
  {
    // The vision's dashed "…" column: more specialist agents, domain by domain.
    id: 'vagt_weitere',
    kind: 'department',
    name: 'Weitere Fachagenten',
    role: 'Je nach Fachgebiet — Platzhalter aus der Vision',
    status: 'planned',
    skillIds: [],
    toolIds: [...SUBSTRATE],
    dataSourceIds: ['vdsr_unternehmenskontext'],
  },
];

const HIERARCHY: [child: string, status: Edge['status']][] = [
  ['vagt_objektvertrieb', 'live'],
  ['vagt_pptx', 'building'],
  ['vagt_holzoffensive', 'planned'],
  ['vagt_businessdev', 'planned'],
  ['vagt_weitere', 'planned'],
];

const edges: Edge[] = HIERARCHY.map(([child, status], index) => ({
  id: `vedg_${String(index + 1).padStart(2, '0')}`,
  source: 'vagt_orchestrator',
  target: child,
  kind: 'hierarchy',
  status,
  label: 'delegiert',
}));

export const VISION_FLEET_ID = 'flt_solarlux_vision';

/** A fresh copy every call - the example is editable once loaded. */
export function solarluxVisionFleet(): Fleet {
  return structuredClone({
    schemaVersion: SCHEMA_VERSION,
    id: VISION_FLEET_ID,
    name: 'Solarlux Vision',
    agents,
    edges,
    skills,
    tools,
    dataSources,
  } satisfies Fleet);
}
