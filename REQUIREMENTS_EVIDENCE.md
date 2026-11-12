# Jak aplikace plní zadání

**Ověřeno 12. 11. 2026.** U každého požadavku je níže konkrétní místo v kódu nebo test. Automatické testy ověřují tok dat se simulovanými odpověďmi API. Neprokazují věcnou správnost výsledné rešerše ani platnost produkčního API klíče.

## Agenti a výstup

**Research agent.** Výzkumník používá `search_sources` v omezeném tool loopu: nejméně dvě různá hledání, nejvýše tři. `searchSources()` volá Perplexity Search API, případně Wikipedii a OpenAlex. Nalezené zdroje dostanou stabilní ID `S1`, `S2` atd. Výzkumník vrátí tvrzení s existujícími ID zdrojů. Viz [`src/worker.js`](src/worker.js) a [test tool loopu](tests/pipeline.test.mjs).

**1. Analýza a syntéza.** Analytik v samostatném volání dostává výzkum, validované hodnocení a zdroje. Musí vrátit neprázdné hlavní body s ID zdrojů, rozpory, omezení a závěr. Neplatný výstup se nepředá autorovi. Viz `validateAnalysis()` a `runReal()` v [`src/worker.js`](src/worker.js).

**2. Autor zprávy.** Autor sestavuje Markdown s odpovědí, nejistotami a citacemi. Server ověřuje, že zpráva není prázdná a že citovaná ID existují. Při `stop_reason: max_tokens` požadavek zopakuje s vyšším limitem; částečnou zprávu neoznačí za hotovou. Viz `completeReport()` v [`src/worker.js`](src/worker.js) a [test useknuté odpovědi](tests/pipeline.test.mjs).

## API, zprávy a nástroj

**3. AI API.** `callClaude()` volá Anthropic Messages API; `searchSources()` volá Perplexity Search API, pokud má server jeho klíč. Obě funkce jsou v [`src/worker.js`](src/worker.js).

**4. Přímé volání bez wrapperu.** API volá nativní `fetch()`. [`package.json`](package.json) neobsahuje LangChain ani jiný agentní framework.

**5. `messages`, systémový prompt a `tools`.** Každé volání sestavuje samostatné `system` a `messages`; výzkumník navíc dostává `tools` a `tool_choice`. `tool_use` a `tool_result` se ukládají do jeho historie zpráv. Server posílá do UI události `llm_request` a `llm_response`; v kartě agenta lze rozbalit tělo požadavku a odpověď včetně `stop_reason`. API hlavičky a klíče se do těchto událostí nevkládají. Viz [`src/worker.js`](src/worker.js), [`src/app.js`](src/app.js) a [test trace](tests/pipeline.test.mjs).

**11. Skutečné použití nástroje.** První dvě vyhledání vynucuje `tool_choice`. Backend každé volání `search_sources` skutečně provede a výsledek vrátí Claude jako `tool_result`. Třetí hledání je volitelné, potom už model další nástroj nedostane. Test kontroluje tři po sobě jdoucí volání nástroje a tři výsledky.

## Projektový Skill

**6. Skill v aplikaci.** Projektový [Skill](.cursor/skills/source-evaluation/SKILL.md) je součástí repozitáře. [`scripts/build.mjs`](scripts/build.mjs) vloží jeho text do serverového balíčku a zkopíruje jeho skript.

**7. Vlastní dokumentace.** `SKILL.md` popisuje hodnocení relevance, autority, aktuálnosti a nezávislosti, rozdíl mezi úryvkem a přečteným článkem, povinný formát JSON a hranici deterministické kontroly.

**8. Vynucené použití Skillu.** Orchestrátor před hodnotitelem volá [`evaluateSources()`](.cursor/skills/source-evaluation/scripts/evaluate.mjs). Skript kontroluje metadata, dostupnost úryvku a ID zdrojů a tvrzení. Hodnotitel dostává výsledek skriptu i `SKILL.md` v systémovém promptu. `validateEvaluation()` pak vyžaduje hodnocení všech zdrojů a tvrzení, platná ID a skóre 0–3. Neúplné hodnocení se opraví nebo běh skončí chybou. Viz [test opravy hodnocení](tests/pipeline.test.mjs).

## Orchestrace a handoff

**9. Samostatné role.** `runReal()` spouští výzkumníka, hodnotitele, analytika a autora v tomto pořadí. Výzkumník má více volání kvůli tool loopu; každá další role má vlastní systémový prompt. Počet API volání závisí na počtu hledání a případných opravách výstupu.

**10. Předávání výsledků.** Po každé z prvních tří rolí vzniká událost `handoff` s výstupem, který dostane další agent ve svých `messages`. Handoff nastane až po serverové validaci daného artefaktu. [Testy](tests/pipeline.test.mjs) ověřují pořadí a také to, že prázdné hodnocení se nepředá analytikovi.

**12. Explicitní pipeline.** Pořadí agentů, tool loop, volání Skillu, validace i předávání jsou samostatné kroky v `runReal()` v [`src/worker.js`](src/worker.js). Nejsou skryté v jednom promptu.

## Jak ověřit

Spusťte `npm test` a `npm run build`. Aktuálních **13 automatických testů** pokrývá tool loop, skript Skillu, validaci handoffů, useknuté odpovědi, citace, API vstup a zobrazení promptů a zpráv. Živý běh vyžaduje platné serverové klíče; původně nastavený klíč Anthropic měl deklarovanou platnost sedm dní.

Bezpečnostní omezení a další testy jsou v [SECURITY_REVIEW.md](SECURITY_REVIEW.md).
