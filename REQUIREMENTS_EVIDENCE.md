# Jak aplikace plní zadání

**Ověřeno 3. 11. 2026.** Níže je u každého požadavku místo v kódu nebo test, podle kterého jej lze zkontrolovat. Všech 13 uvedených bodů je implementováno. Automatické testy ověřují tok dat a volání API se simulovanými odpověďmi; neposuzují věcnou správnost každé výsledné zprávy.

## Agenti a výsledek

**Research agent.** Výzkumník si vyžádá nástroj `search_sources`. Funkce `searchSources()` získá titulky, odkazy a úryvky přes Perplexity Search API; bez jeho klíče hledá na Wikipedii a v OpenAlex. Výsledkům přiřadí ID `S1`, `S2` atd. a předá je modelu. Viz [`src/worker.js`](src/worker.js#L103-L153) a [test vyhledávání](tests/pipeline.test.mjs#L61-L90). Agent pracuje s výsledky hledání, plné články neotevírá.

**1. Analýza a syntéza.** Hodnotitel nejprve posoudí zdroje. Analytik pak v samostatném volání Claude dostane výzkum, hodnocení a seznam zdrojů; jeho systémový prompt požaduje hlavní body, rozpory, omezení a závěr. Viz [`runReal()`](src/worker.js#L214-L233). [Test pipeline](tests/pipeline.test.mjs#L8-L58) ověřuje, že analytik skutečně dostal výstup předchozího agenta.

**2. Autor zprávy.** Poslední volání Claude dostane analýzu, hodnocení a zdroje. Prompt žádá odpověď v Markdownu se zjištěními, nejistotami a odkazy ve tvaru `[S1]`. Web ukazuje autorův výstup a nabízí stažení `.md`. Viz [`src/worker.js`](src/worker.js#L235-L242), [`src/app.js`](src/app.js) a [test pipeline](tests/pipeline.test.mjs#L8-L58).

## API, zprávy a nástroj

**3. AI API.** Funkce `callClaude()` posílá požadavky přímo na Anthropic Messages API. Vyhledávání může použít také Perplexity Search API. Viz [`src/worker.js`](src/worker.js#L85-L120). Úspěšný běh byl ověřen také na veřejném nasazení.

**4. Přímé volání bez wrapperu.** Obě služby volá nativní `fetch()`. V [`package.json`](package.json) není LangChain ani jiná provozní knihovna pro orchestrace agentů.

**5. `messages`, systémový prompt a `tools`.** `callClaude()` sestavuje tělo požadavku z `model`, `system`, `messages` a případně `tools`. Výzkumník má vlastní systémový prompt; po vyhledání přidá do konverzace bloky `tool_use` a `tool_result`. Každá další role má samostatný prompt a zprávu s předanými daty. Viz [`src/worker.js`](src/worker.js#L85-L94) a [`runReal()`](src/worker.js#L186-L241). [Test pipeline](tests/pipeline.test.mjs#L8-L58) kontroluje těla požadavků. Ve webu jsou vidět kroky agentů a volání nástroje; samotné systémové prompty lze číst ve zdrojovém kódu.

**11. Skutečné použití nástroje.** První volání Claude dostane schéma `search_sources` a `tool_choice`, které vyžaduje jeho použití. Backend poté provede vyhledávání a výsledek vrátí modelu jako `tool_result`. Viz [`src/worker.js`](src/worker.js#L189-L209) a [test s Perplexity](tests/pipeline.test.mjs#L61-L90).

## Projektový Skill

**6. Skill v aplikaci.** Skill `source-evaluation` je uložen v [`.cursor/skills/source-evaluation/SKILL.md`](.cursor/skills/source-evaluation/SKILL.md). [`scripts/build.mjs`](scripts/build.mjs) jej při sestavení vloží do serverové aplikace.

**7. Vlastní dokumentace.** `SKILL.md` popisuje, kdy se použije, jak se hodnotí relevance a důvěryhodnost zdroje, co znamená `snippet_only`, jak má vypadat výstup v JSON a uvádí příklad.

**8. Použití hodnotitelem.** `runReal()` přidá text Skillu do systémového promptu hodnotitele a do živého záznamu odešle událost `skill_loaded`. [Test pipeline](tests/pipeline.test.mjs#L48-L54) kontroluje přítomnost pravidla `snippet_only` v promptu. Viz [`src/worker.js`](src/worker.js#L214-L223).

## Orchestrace a předávání

**9. Samostatné role.** `runReal()` volá postupně výzkumníka, hodnotitele, analytika a autora. Celý běh obsahuje pět volání Claude, protože výzkumník po použití nástroje dostane ještě druhé volání pro zpracování zdrojů. Viz [`src/worker.js`](src/worker.js#L186-L242); [test](tests/pipeline.test.mjs#L8-L58) kontroluje pořadí.

**10. Handoff.** Po výzkumníkovi, hodnotiteli a analytikovi aplikace odešle událost `handoff` s výstupem předchozího kroku. Tatáž data vloží do zprávy pro dalšího agenta. Web zobrazuje časovou osu a rozbalitelný výstup každé role. Viz [`src/worker.js`](src/worker.js#L210-L239), [`src/app.js`](src/app.js) a [test pořadí předání](tests/pipeline.test.mjs#L48-L52).

**12. Pipeline přímo v kódu.** Pořadí rolí, samostatné prompty, vstupy a výstupy jsou v `runReal()`. Nejde o jeden prompt, který by jen popisoval čtyři role. Viz [`src/worker.js`](src/worker.js#L186-L242).

## Jak si to ověřit

Spusťte `npm test` a `npm run build`. Potom ve [veřejné aplikaci](https://multi-agent-research-assistant-two.vercel.app/) zadejte krátkou otázku. V časové ose uvidíte vyhledávání, načtení Skillu, tři předání a výstup každého agenta. Osm automatických testů prošlo; při jednom ověřeném produkčním běhu aplikace vrátila osm zdrojů, čtyři výstupy a tři předání.

Omezení a návrhy dalších kontrol popisuje [SECURITY_REVIEW.md](SECURITY_REVIEW.md).
