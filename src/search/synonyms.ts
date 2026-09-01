/**
 * SPEC 5.10 / 8.3 - DE-EN synonym table. A German fleet described in German must
 * still be findable by an English word and the other way round ("Angebot" finds
 * "offer", "Vertrieb" finds "sales").
 *
 * Every entry is a group of interchangeable terms; the index expands a query token
 * into its whole group before searching. Groups are lower-cased and matched whole,
 * so "sale" will not accidentally pull in "sales" - fuzzy matching handles that.
 */

const GROUPS: string[][] = [
  ['angebot', 'angebote', 'offer', 'offers', 'quote', 'quotes', 'proposal'],
  ['vertrieb', 'sales', 'selling'],
  ['marketing', 'werbung', 'advertising', 'campaign', 'kampagne', 'kampagnen'],
  ['kunde', 'kunden', 'customer', 'customers', 'client', 'clients'],
  ['lead', 'leads', 'interessent', 'interessenten', 'prospect'],
  ['projekt', 'projekte', 'project', 'projects', 'bauprojekt', 'bauprojekte'],
  ['preis', 'preise', 'preisliste', 'preislisten', 'price', 'prices', 'pricelist'],
  ['mitarbeiter', 'personal', 'employee', 'employees', 'staff', 'hr'],
  ['einstellung', 'recruiting', 'hiring', 'bewerbung', 'bewerbungen', 'application', 'applications'],
  ['onboarding', 'einarbeitung'],
  ['uebersetzung', 'übersetzung', 'translation', 'translate', 'uebersetzen', 'übersetzen'],
  ['dokument', 'dokumente', 'document', 'documents', 'unterlagen'],
  ['bericht', 'berichte', 'report', 'reports', 'auswertung'],
  ['analyse', 'analysis', 'analytics', 'auswertung'],
  ['markt', 'market', 'marktanalyse'],
  ['partner', 'partners', 'partnership'],
  ['inhalt', 'inhalte', 'content', 'text', 'copy'],
  ['bild', 'bilder', 'image', 'images', 'visual', 'visuals', 'grafik'],
  ['suche', 'search', 'recherche', 'research'],
  ['werkzeug', 'werkzeuge', 'tool', 'tools'],
  ['faehigkeit', 'fähigkeit', 'faehigkeiten', 'fähigkeiten', 'skill', 'skills'],
  ['datenquelle', 'datenquellen', 'data', 'datasource', 'daten'],
  ['abteilung', 'abteilungen', 'department', 'departments'],
  ['agent', 'agents', 'bot', 'bots'],
  ['orchestrator', 'dirigent', 'router'],
  ['geteilt', 'shared', 'gemeinsam'],
  ['geplant', 'planned'],
  ['live', 'aktiv', 'active', 'fertig', 'ready'],
  ['in arbeit', 'building', 'wip', 'laufend', 'progress'],
  ['workflow', 'ablauf', 'flow', 'prozess', 'process'],
  ['vorlage', 'vorlagen', 'template', 'templates'],
  ['praesentation', 'präsentation', 'presentation', 'deck', 'slides', 'folien', 'powerpoint'],
  ['mail', 'email', 'e-mail', 'outlook', 'post'],
  ['chat', 'teams', 'nachricht', 'message'],
];

const EXPANSION = new Map<string, string[]>();
for (const group of GROUPS) {
  for (const term of group) {
    const existing = EXPANSION.get(term);
    if (existing) existing.push(...group.filter((other) => !existing.includes(other)));
    else EXPANSION.set(term, [...group]);
  }
}

/**
 * A token plus every synonym of it (the token always comes first so an exact hit
 * still outranks a synonym hit).
 */
export function expandToken(token: string): string[] {
  const normalized = token.trim().toLowerCase();
  if (normalized === '') return [];
  const group = EXPANSION.get(normalized);
  if (!group) return [normalized];
  return [normalized, ...group.filter((term) => term !== normalized)];
}

/** Exposed for the tests and for a future settings screen. */
export const SYNONYM_GROUPS = GROUPS;
