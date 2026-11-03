# Ověření zadání a důkazy

Stav k 3. 11. 2026. Důkazy níže odkazují na implementaci a reprodukovatelné testy. „Splněno“ označuje existenci a funkční zapojení požadované části; kvalita faktických závěrů závisí na konkrétním tématu a nalezených zdrojích.

| # | Požadavek | Stav a konkrétní důkaz |
| --- | --- | --- |
| R | Research agent prohledá web, sbírá zdroje a dílčí informace | **Splněno.** `runReal()` v `src/worker.js` vyžaduje `search_sources`, `searchSources()` volá Perplexity Search API; bez klíče používá Wikipedii a OpenAlex. Výsledky dostávají ID `S1…`, titulky, URL, úryvky a metadata. Výzkumník po `tool_result` vrací `summary`, `findings`, `open_questions`. Test `s Perplexity klíčem používá Search API…` ověřuje skutečné zavolání nástroje a předání zdroje. Omezení: jde o výsledky vyhledávání, nikoli ověření plného textu. |
| 1 | Analysis/synthesis agent zpracuje data, hledá souvislosti, hodnotí relevanci | **Splněno na úrovni orchestrace.** Před analytikem běží hodnotitel, který pomocí Skillu boduje relevanci a další vlastnosti zdrojů. Analytik dostane `research`, `evaluation` a `sources` v samostatném volání `callClaude()` a má vytvořit `key_points`, `tensions`, `limitations`, `conclusion` (`src/worker.js`, část 2–3 `runReal()`). Test pipeline ověřuje, že skutečně dostal hodnocení předchozího agenta. Věcnou správnost každé syntézy automatický test neměří. |
| 2 | Writer agent sestaví finální strukturovaný výstup | **Splněno.** Čtvrté agentní volání v `runReal()` přijímá analýzu, hodnocení a zdroje a vrací Markdown s odpovědí, zjištěními, nejistotami a citacemi `[S1]`. `src/app.js` zobrazuje výstup autora a nabízí stažení `.md`. Test pipeline kontroluje, že autor dostal výstup analytika. |
| 3 | Claude API nebo jiné AI API | **Splněno.** `callClaude()` volá `https://api.anthropic.com/v1/messages`; vyhledávání může volat také Perplexity Search API. Lokální i produkční běh s API klíči byl funkčně ověřen. |
| 4 | Přímé volání API bez LangChain a wrapperů | **Splněno.** `src/worker.js` používá nativní `fetch()` pro Claude i Perplexity. `package.json` nemá runtime závislosti; `npm audit` hlásí 0 zranitelností. |
| 5 | Viditelná práce s `messages`, `system` promptem a `tools` | **Splněno.** `callClaude()` skládá JSON tělo s `model`, `system`, `messages` a případně `tools`/`tool_choice`. `runReal()` má pro každou roli vlastní systémový prompt. Výzkumník do `researchMessages` přidá bloky `tool_use` a odpovídající `tool_result` (část 1 `runReal()`). Test pipeline zachytává těla všech pěti požadavků a kontroluje jejich obsah. UI zároveň ukazuje volání a výsledek nástroje. |
| 6 | Skill jako součást aplikace | **Splněno.** Projektový Skill `source-evaluation` je součástí repozitáře v `.cursor/skills/source-evaluation/SKILL.md`; build v `scripts/build.mjs` jej vkládá do serverového balíčku. |
| 7 | Vlastní zdokumentovaný `SKILL.md` | **Splněno.** Soubor má metadata `name`, `description`, podmínku použití, postup bodování 0–3, rozlišení primárních/sekundárních zdrojů, pravidla pro `snippet_only`, výstupní JSON strukturu a příklad. |
| 8 | Skill reálně použit subagentem | **Splněno.** `criticResponse` v `src/worker.js` obsahuje `SOURCE_SKILL` přímo v `system` promptu hodnotitele. Test pipeline ověřuje přítomnost `snippet_only` v jeho systémovém promptu. UI dostává událost `skill_loaded`. |
| 9 | Explicitní agentní orchestrace | **Splněno.** `runReal()` má čtyři samostatné kroky Research → Critic → Analyst → Writer a pět volání Claude API (výzkumník nejprve tool, potom odpověď). Nejde o jednu odpověď na společný prompt. Test kontroluje pořadí modelů a agentů. |
| 10 | Jasné předávání výstupů mezi subagenty | **Splněno.** `src/worker.js` emituje tři `handoff` události s payloadem a současně serializuje předchozí artefakty do `messages` následujícího agenta. Test kontroluje pořadí `research→critic→analyst→writer` i obsah vstupu analytika a autora. `src/app.js` zobrazuje časovou osu a výstup každého agenta. |
| 11 | Alespoň jeden agent skutečně volá nástroj | **Splněno.** Výzkumník dostane schema `search_sources`, `tool_choice` vynucuje jeho použití, backend provede `searchSources()` a výsledek pošle modelu jako `tool_result`. Test kontroluje jedno vyhledání Perplexity a následné zpracování. |
| 12 | Sekvenční pipeline explicitně v kódu | **Splněno.** Pořadí a předávané objekty jsou přímo čitelné v `runReal()` v `src/worker.js`. Jednotlivé role mají oddělené systémové prompty, volání API, výstupy a SSE události. |

## Jak důkazy zopakovat

1. `npm test` — osm testů pipeline, nástroje, Skillu, handoffů, rozhraní a bezpečnostních hranic.
2. `npm run build` — sestavení UI a serveru včetně aktuálního Skillu.
3. V aplikaci spusťte krátké téma; v časové ose sledujte `NÁSTROJ`, `SKILL`, tři `HANDOFF` a výstupy všech čtyř agentů. Každý úspěšný běh používá Claude API.

Bezpečnostní nálezy, hranice prompt injection a další testovací plán jsou v [SECURITY_REVIEW.md](SECURITY_REVIEW.md).
