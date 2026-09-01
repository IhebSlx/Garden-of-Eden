/**
 * SPEC 9 (Phase 0) - the Solarlux demo fleet from `reference/prototype.html`,
 * migrated to the library-based model of SPEC 4.
 *
 * Two model changes vs the prototype, both mandated by SPEC 8:
 *  - `kind:'shared'` is gone. PowerPoint Creator, Translator DE/EN and SharePoint
 *    Reader are plain workers; their shared-ness is derived from having >= 2
 *    hierarchy parents.
 *  - Skills, tools and data sources were inline per-agent objects matched by name.
 *    They are now first-class library entities referenced by id, deduplicated by
 *    the name the prototype matched on.
 *
 * Where the prototype carried two different descriptions under one tool name
 * (`Dataverse API`, `Teams`), the descriptions are merged - the prototype's own
 * `usedBy()` already treated them as one tool.
 *
 * SPEC 5.11: this ships as a loadable example, never as the default fleet.
 */
import { SCHEMA_VERSION } from './schemas.js';
import type { Agent, DataSource, Edge, Fleet, Skill, Tool } from './schemas.js';

const skill = (id: string, name: string): Skill => ({ id: `skl_${id}`, name });

export const SEED_SKILLS: Skill[] = [
  skill('intent_routing', 'Intent routing'),
  skill('kampagnen_briefing', 'Kampagnen-Briefing'),
  skill('brand_voice', 'Brand voice'),
  skill('marktanalyse', 'Marktanalyse'),
  skill('angebotserstellung', 'Angebotserstellung'),
  skill('projektqualifizierung', 'Projektqualifizierung'),
  skill('stellenprofile', 'Stellenprofile'),
  skill('blogposts', 'Blogposts'),
  skill('post_planung', 'Post-Planung'),
  skill('research', 'Research'),
  skill('scoring', 'Scoring'),
  skill('bant_check', 'BANT-Check'),
  skill('angebotslogik', 'Angebotslogik'),
  skill('cv_analyse', 'CV-Analyse'),
  skill('faq', 'FAQ'),
  skill('slide_design', 'Slide design'),
  skill('fachbegriffe', 'Fachbegriffe'),
];

/** Linear prototype chains become explicit steps; the first is the trigger. */
function chain(prefix: string, steps: string[]): Tool['workflow'] {
  return {
    steps: steps.map((label, index) => {
      const isTrigger = index === 0 && label.startsWith('Trigger');
      const next = index < steps.length - 1 ? [`stp_${prefix}_${index + 1}`] : [];
      return {
        id: `stp_${prefix}_${index}`,
        name: label.replace(/^Trigger · /, ''),
        kind: isTrigger ? ('trigger' as const) : ('action' as const),
        next,
      };
    }),
  };
}

export const SEED_TOOLS: Tool[] = [
  {
    id: 'tol_fleet_router',
    name: 'Fleet router',
    description: 'Routes requests to the best-matching department agent.',
    type: 'microsoft',
  },
  { id: 'tol_image_gen', name: 'Image gen', description: 'Generates campaign visuals.', type: 'python' },
  { id: 'tol_mail', name: 'Mail', description: 'Sends drafts to the marketing inbox.', type: 'microsoft' },
  {
    id: 'tol_web_research',
    name: 'Web research',
    description: 'Searches and summarizes public sources.',
    type: 'python',
  },
  {
    id: 'tol_dataverse_api',
    name: 'Dataverse API',
    // Merged from the prototype's two descriptions for the same tool name.
    description: 'Reads and writes Bauprojekt, account and incoming lead records.',
    type: 'microsoft',
  },
  { id: 'tol_outlook', name: 'Outlook', description: 'Sends and reads project mail.', type: 'microsoft' },
  {
    id: 'tol_teams',
    name: 'Teams',
    description: 'Posts to HR channels and answers chats, including new-hire questions.',
    type: 'microsoft',
  },
  { id: 'tol_seo_check', name: 'SEO check', description: 'Scores drafts for search visibility.', type: 'python' },
  {
    id: 'tol_linkedin_api',
    name: 'LinkedIn API',
    description: 'Schedules and publishes posts.',
    type: 'microsoft',
  },
  { id: 'tol_web_search', name: 'Web search', description: 'Finds competitor and market data.', type: 'python' },
  { id: 'tol_crm_api', name: 'CRM API', description: 'Reads partner records.', type: 'microsoft' },
  {
    id: 'tol_lead_scoring_flow',
    name: 'Lead-Scoring Flow',
    description: 'Scores a new lead and updates the record.',
    type: 'workflow',
    workflow: chain('lead', [
      'Trigger · new lead in CRM',
      'Fetch account history (Dataverse)',
      'Compute BANT score',
      'Update lead record',
      'Notify Objektvertrieb (Teams)',
    ]),
  },
  {
    id: 'tol_angebots_flow',
    name: 'Angebots-Flow',
    description: 'Builds an offer PDF from project data.',
    type: 'workflow',
    workflow: chain('angebot', [
      'Trigger · project marked "qualified"',
      'Get project data (Dataverse)',
      'Fill offer template (PDF)',
      'Save to SharePoint',
      'Send to sales (Outlook)',
    ]),
  },
  {
    id: 'tol_pdf_fill',
    name: 'PDF fill',
    description: 'Fills form fields in the offer template.',
    type: 'python',
  },
  { id: 'tol_ats_api', name: 'ATS API', description: 'Reads incoming applications.', type: 'python' },
  {
    id: 'tol_pptx_engine',
    name: 'PPTX engine',
    description: 'Turns an outline into a finished deck.',
    type: 'workflow',
    workflow: chain('pptx', [
      'Receive outline',
      'Apply corporate template',
      'Generate slides',
      'Return .pptx file',
    ]),
  },
  { id: 'tol_deepl', name: 'DeepL', description: 'Translates DE-EN with company glossary.', type: 'python' },
  {
    id: 'tol_graph_api',
    name: 'Graph API',
    description: 'Reads SharePoint sites and lists.',
    type: 'microsoft',
  },
];

export const SEED_DATA_SOURCES: DataSource[] = [
  { id: 'dsr_unternehmenskontext', name: 'Unternehmenskontext', type: 'md', status: 'live', linked: true },
  { id: 'dsr_brand_guidelines', name: 'Brand guidelines', type: 'sharepoint', status: 'building' },
  { id: 'dsr_crm', name: 'CRM', type: 'dataverse', status: 'planned' },
  { id: 'dsr_bauprojekte', name: 'Bauprojekte', type: 'dataverse', status: 'live', linked: true },
  { id: 'dsr_personalhandbuch', name: 'Personalhandbuch', type: 'sharepoint', status: 'live', linked: false },
  { id: 'dsr_website', name: 'Website', type: 'sharepoint', status: 'live', linked: true },
  { id: 'dsr_post_archiv', name: 'Post-Archiv', type: 'sharepoint', status: 'building' },
  { id: 'dsr_reports', name: 'Reports', type: 'sharepoint', status: 'planned' },
  { id: 'dsr_partner_liste', name: 'Partner-Liste', type: 'dataverse', status: 'planned' },
  { id: 'dsr_crm_leads', name: 'CRM leads', type: 'dataverse', status: 'live', linked: true },
  { id: 'dsr_preislisten', name: 'Preislisten', type: 'sharepoint', status: 'building' },
  { id: 'dsr_bewerbungen', name: 'Bewerbungen', type: 'dataverse', status: 'building' },
  { id: 'dsr_corporate_template', name: 'Corporate template', type: 'sharepoint', status: 'live', linked: true },
  { id: 'dsr_sharepoint_sites', name: 'SharePoint sites', type: 'sharepoint', status: 'live', linked: true },
];

export const SEED_AGENTS: Agent[] = [
  {
    id: 'agt_orch',
    kind: 'orchestrator',
    name: 'Solarlux Orchestrator',
    role: 'Routes every request to the right department',
    status: 'live',
    instructions:
      'Understand the request, pick the right department, pass full context. Never answer domain questions yourself.',
    skillIds: ['skl_intent_routing'],
    toolIds: ['tol_fleet_router'],
    dataSourceIds: ['dsr_unternehmenskontext'],
  },
  {
    id: 'agt_mkt',
    kind: 'department',
    name: 'Marketing',
    role: 'Campaigns, brand and content',
    status: 'building',
    instructions: 'Keep the Solarlux brand voice. Check brand guidelines before anything goes out.',
    skillIds: ['skl_kampagnen_briefing', 'skl_brand_voice'],
    toolIds: ['tol_image_gen', 'tol_mail'],
    dataSourceIds: ['dsr_brand_guidelines'],
  },
  {
    id: 'agt_bd',
    kind: 'department',
    name: 'Business Development',
    role: 'Markets, partners and growth',
    status: 'planned',
    instructions: 'Validate market claims with at least two independent sources.',
    skillIds: ['skl_marktanalyse'],
    toolIds: ['tol_web_research'],
    dataSourceIds: ['dsr_crm'],
  },
  {
    id: 'agt_ov',
    kind: 'department',
    name: 'Objektvertrieb',
    role: 'Project sales for large builds',
    status: 'live',
    instructions:
      'Qualify every Bauprojekt before drafting offers. Use Unternehmenskontext for product facts.',
    skillIds: ['skl_angebotserstellung', 'skl_projektqualifizierung'],
    toolIds: ['tol_dataverse_api', 'tol_outlook'],
    dataSourceIds: ['dsr_unternehmenskontext', 'dsr_bauprojekte'],
  },
  {
    id: 'agt_hr',
    kind: 'department',
    name: 'HR',
    role: 'People, hiring and onboarding',
    status: 'building',
    instructions: 'Never expose personal data outside HR scope.',
    skillIds: ['skl_stellenprofile'],
    toolIds: ['tol_teams'],
    dataSourceIds: ['dsr_personalhandbuch'],
  },
  {
    id: 'agt_w1',
    kind: 'worker',
    name: 'Content Writer',
    role: 'Blog and web copy',
    status: 'building',
    instructions: 'Write in Solarlux tone. German first, English on request.',
    skillIds: ['skl_blogposts'],
    toolIds: ['tol_seo_check'],
    dataSourceIds: ['dsr_website'],
  },
  {
    id: 'agt_w2',
    kind: 'worker',
    name: 'Social Media',
    role: 'Posts and scheduling',
    status: 'planned',
    skillIds: ['skl_post_planung'],
    toolIds: ['tol_linkedin_api'],
    dataSourceIds: ['dsr_post_archiv'],
  },
  {
    id: 'agt_w3',
    kind: 'worker',
    name: 'Market Analyst',
    role: 'Competitor and market scans',
    status: 'planned',
    skillIds: ['skl_research'],
    toolIds: ['tol_web_search'],
    dataSourceIds: ['dsr_reports'],
  },
  {
    id: 'agt_w4',
    kind: 'worker',
    name: 'Partner Scout',
    role: 'Finds and rates partners',
    status: 'planned',
    skillIds: ['skl_scoring'],
    toolIds: ['tol_crm_api'],
    dataSourceIds: ['dsr_partner_liste'],
  },
  {
    id: 'agt_w5',
    kind: 'worker',
    name: 'Lead Qualifier',
    role: 'Scores incoming Bauprojekte',
    status: 'live',
    instructions: 'Score leads with BANT. Flag anything above 80 to the department.',
    skillIds: ['skl_bant_check'],
    toolIds: ['tol_dataverse_api', 'tol_lead_scoring_flow'],
    dataSourceIds: ['dsr_crm_leads'],
  },
  {
    id: 'agt_w6',
    kind: 'worker',
    name: 'Angebots-Assistent',
    role: 'Drafts offers from project data',
    status: 'building',
    instructions: 'Draft offers only from qualified projects. Always use current price lists.',
    skillIds: ['skl_angebotslogik'],
    toolIds: ['tol_angebots_flow', 'tol_pdf_fill'],
    dataSourceIds: ['dsr_preislisten'],
  },
  {
    id: 'agt_w7',
    kind: 'worker',
    name: 'Recruiting Screener',
    role: 'Pre-screens applications',
    status: 'building',
    skillIds: ['skl_cv_analyse'],
    toolIds: ['tol_ats_api'],
    dataSourceIds: ['dsr_bewerbungen'],
  },
  {
    id: 'agt_w8',
    kind: 'worker',
    name: 'Onboarding Guide',
    role: 'Answers new-hire questions',
    status: 'planned',
    skillIds: ['skl_faq'],
    toolIds: ['tol_teams'],
    dataSourceIds: ['dsr_personalhandbuch'],
  },
  // The three agents the prototype marked kind:'shared' - now workers with many parents.
  {
    id: 'agt_ppt',
    kind: 'worker',
    name: 'PowerPoint Creator',
    role: 'Builds decks in corporate design',
    status: 'building',
    instructions: 'Always use the corporate template. One message per slide.',
    skillIds: ['skl_slide_design'],
    toolIds: ['tol_pptx_engine'],
    dataSourceIds: ['dsr_corporate_template'],
  },
  {
    id: 'agt_tr',
    kind: 'worker',
    name: 'Translator DE/EN',
    role: 'Translates any document',
    status: 'live',
    skillIds: ['skl_fachbegriffe'],
    toolIds: ['tol_deepl'],
    dataSourceIds: [],
  },
  {
    id: 'agt_sp',
    kind: 'worker',
    name: 'SharePoint Reader',
    role: 'Reads and cites internal sites',
    status: 'live',
    skillIds: [],
    toolIds: ['tol_graph_api'],
    dataSourceIds: ['dsr_sharepoint_sites'],
  },
];

type SeedEdge = [source: string, target: string, kind: Edge['kind'], status: Edge['status']];

const SEED_EDGE_TUPLES: SeedEdge[] = [
  ['agt_orch', 'agt_mkt', 'hierarchy', 'building'],
  ['agt_orch', 'agt_bd', 'hierarchy', 'planned'],
  ['agt_orch', 'agt_ov', 'hierarchy', 'live'],
  ['agt_orch', 'agt_hr', 'hierarchy', 'building'],
  ['agt_mkt', 'agt_w1', 'hierarchy', 'building'],
  ['agt_mkt', 'agt_w2', 'hierarchy', 'planned'],
  ['agt_bd', 'agt_w3', 'hierarchy', 'planned'],
  ['agt_bd', 'agt_w4', 'hierarchy', 'planned'],
  ['agt_ov', 'agt_w5', 'hierarchy', 'live'],
  ['agt_ov', 'agt_w6', 'hierarchy', 'building'],
  ['agt_hr', 'agt_w7', 'hierarchy', 'building'],
  ['agt_hr', 'agt_w8', 'hierarchy', 'planned'],
  // PowerPoint Creator is shared by three departments.
  ['agt_mkt', 'agt_ppt', 'hierarchy', 'building'],
  ['agt_bd', 'agt_ppt', 'hierarchy', 'planned'],
  ['agt_ov', 'agt_ppt', 'hierarchy', 'building'],
  // Translator by two.
  ['agt_mkt', 'agt_tr', 'hierarchy', 'building'],
  ['agt_hr', 'agt_tr', 'hierarchy', 'live'],
  // SharePoint Reader by two.
  ['agt_ov', 'agt_sp', 'hierarchy', 'live'],
  ['agt_hr', 'agt_sp', 'hierarchy', 'building'],
  // Peer link - never part of the hierarchy or of focus (SPEC 5.2).
  ['agt_bd', 'agt_ov', 'peer', 'planned'],
];

export const SEED_EDGES: Edge[] = SEED_EDGE_TUPLES.map(([source, target, kind, status], index) => ({
  id: `edg_${String(index + 1).padStart(2, '0')}_${source.slice(4)}_${target.slice(4)}`,
  source,
  target,
  kind,
  status,
}));

export const SEED_FLEET_ID = 'flt_solarlux_demo';

/** A fresh copy every call - the demo fleet is editable once loaded. */
export function solarluxFleet(): Fleet {
  return structuredClone({
    schemaVersion: SCHEMA_VERSION,
    id: SEED_FLEET_ID,
    name: 'Solarlux Fleet',
    agents: SEED_AGENTS,
    edges: SEED_EDGES,
    skills: SEED_SKILLS,
    tools: SEED_TOOLS,
    dataSources: SEED_DATA_SOURCES,
  } satisfies Fleet);
}
