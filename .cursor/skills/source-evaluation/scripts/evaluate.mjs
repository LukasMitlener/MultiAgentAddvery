// Deterministic pre-check. It measures available metadata, not factual truth.
const terms = text => new Set(String(text || '').toLocaleLowerCase('cs-CZ').match(/[\p{L}\p{N}]{4,}/gu) || []);

export function evaluateSources(question, sources, findings) {
  if (!Array.isArray(sources) || !sources.length) throw new Error('Skill: chybí zdroje.');
  if (!Array.isArray(findings) || !findings.length) throw new Error('Skill: chybí tvrzení k hodnocení.');
  const ids = new Set(sources.map(source => source.id));
  const queryTerms = terms(question);
  const sourceChecks = sources.map(source => {
    const matchedTerms = [...terms(`${source.title} ${source.snippet}`)].filter(term => queryTerms.has(term));
    return {
      id: source.id,
      snippet_only: true,
      metadata: {
        title: Boolean(source.title),
        url: Boolean(source.url),
        provider: Boolean(source.provider),
        date: Boolean(source.date),
      },
      query_terms_in_result: matchedTerms.slice(0, 8),
    };
  });
  const claimChecks = findings.map(finding => ({
    claim: finding.claim,
    source_ids: finding.source_ids,
    unknown_source_ids: finding.source_ids.filter(id => !ids.has(id)),
  }));
  if (claimChecks.some(claim => claim.unknown_source_ids.length)) throw new Error('Skill: tvrzení odkazuje na neznámý zdroj.');
  return { sources: sourceChecks, claims: claimChecks };
}
