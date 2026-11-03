# Multi-agentní výzkumný asistent

Webová aplikace pro rešerši témat a otázek. Vyhledá relevantní zdroje, oddělí zjištěné informace od nejistot a připraví přehlednou zprávu s odkazy na použité zdroje. Celý postup zajišťují čtyři agenti s odlišnými rolemi: výzkumník, hodnotitel zdrojů, analytik a autor zprávy.

Průběh je vidět přímo v aplikaci. U každého agenta se zobrazuje aktuální krok a jeho výstup; časová osa ukazuje použití vyhledávacího nástroje, načtení Skillu a předání dat dalšímu agentovi. Po dokončení lze výslednou zprávu stáhnout jako Markdown. Aplikace volá Claude Messages API přímo přes `fetch` a nepoužívá LangChain ani jiný agentní framework.

**Vyzkoušet online:** [multi-agent-research-assistant-two.vercel.app](https://multi-agent-research-assistant-two.vercel.app/)

## Jak aplikaci používat

1. Zadejte téma nebo konkrétní otázku, například „Jaké jsou hlavní dopady obnovitelných zdrojů v Evropě?“
2. Klikněte na **Spustit výzkum**. Aplikace použije Claude API klíč nastavený na serveru; vlastní klíč do webu nezadáváte.
3. Sledujte práci agentů, nalezené zdroje a jednotlivá předání.
4. Přečtěte si závěrečnou zprávu včetně nejistot a citací; případně ji stáhněte jako soubor `.md`.

Vyhledávání používá Perplexity Search API. Není-li jeho klíč dostupný, aplikace používá Wikipedii a OpenAlex. Výsledky vyhledávání obsahují titulky, odkazy a úryvky; aplikace nečte celé články. Závěry proto berte jako výzkumný přehled, u důležitých rozhodnutí ověřte primární zdroje.

## Rychlé spuštění

Potřebujete Node.js 20+ a klíč Anthropic; klíč Perplexity je volitelný. Projekt nemá externí npm závislosti. Pokud `.env.local` ještě nemáte, vytvořte jej podle `.env.example` a doplňte klíče.

```powershell
npm run dev
```

Otevřete `http://localhost:8787`. Vývojový server načítá `.env.local` (případně `.env`). Bez Perplexity klíče slouží jako záložní zdroje Wikipedia a OpenAlex. Bez klíče Anthropic aplikace výzkum nespustí a zobrazí srozumitelnou chybu.

### Konfigurace API a modelů

- `ANTHROPIC_API_KEY` — serverový klíč pro Claude API.
- `PERPLEXITY_API_KEY` — serverový klíč pro Perplexity Search API; výsledky obsahují URL, titulek a úryvek, nikoli hotovou odpověď.
- `CLAUDE_FAST_MODEL` — výchozí `claude-haiku-5-5` pro výzkumníka a hodnotitele.
- `CLAUDE_DEEP_MODEL` — výchozí `claude-sonnet-5-5` pro analytika a autora.
- `PORT` — výchozí `8787` pro místní server.

Haiku je zde zvolen pro krátké kroky s nástrojem, extrakci a hodnocení podle rubriky; Sonnet pro syntézu a psaní. Podle [přehledu modelů Anthropic](https://platform.claude.com/docs/en/models/overview) je Haiku určen pro rychlé úlohy a Sonnet nabízí vyváženou kombinaci rychlosti a schopností.

## Jak funguje orchestrace

| Krok | Agent | Vstup | Akce | Výstup |
| --- | --- | --- | --- | --- |
| 1 | Výzkumník | Otázka | Claude Haiku povinně volá klientský tool `search_sources`; backend přímo zavolá Perplexity Search API a pošle `tool_result` zpět modelu. | JSON s poznatky a ID zdrojů |
| 2 | Hodnotitel | Výzkum + zdroje | Claude Haiku načte projektový Skill `source-evaluation` do vlastního `system` promptu. | JSON s hodnocením kvality, slabinami důkazů a mezerami |
| 3 | Analytik | Výzkum + hodnocení + zdroje | Claude Sonnet syntetizuje podložená tvrzení, rozpory a nejistoty. | JSON analýza |
| 4 | Autor | Analýza + hodnocení + zdroje | Claude Sonnet napíše strukturovanou zprávu. | Markdown s citacemi `[S1]` atd. |

Předávání je explicitní ve `src/worker.js` v `runReal()`. Každý krok má vlastní systémový prompt a samostatné volání API. Artefakty jsou serializované do následujících `messages`; žádná role se neskrývá v jednom společném promptu. Frontend přijímá průběžné SSE události `agent_start`, `tool_call`, `tool_result`, `skill_loaded`, `agent_output`, `handoff`, `run_done` a `run_error`.

Projektový Skill je v [`.cursor/skills/source-evaluation/SKILL.md`](.cursor/skills/source-evaluation/SKILL.md). Build vloží jeho **aktuální obsah** do serverového balíčku. Hodnotitel jej dostane jako součást `system` promptu; v UI se zároveň objeví událost `skill_loaded`. Skill má konkrétní rubric pro relevanci, autoritu, aktuálnost a nezávislost, pravidla pro úryvky a požadovaný JSON výstup.

## Souborová struktura

```text
src/worker.js                              server, nástroj, API, orchestrace, SSE
src/index.html                             UI
src/styles.css                             vzhled
src/brand.css                              barevná vrstva rozhraní
src/app.js                                 zobrazení průběhu
api/run.mjs, api/health.mjs                Vercel Functions adapter
.cursor/skills/source-evaluation/SKILL.md  vlastní Skill
scripts/build.mjs                          sestavení balíčku bez závislostí
scripts/dev.mjs                            místní server
tests/pipeline.test.mjs                    test handoffů, Skillu a tool callu
REQUIREMENTS_EVIDENCE.md                    technické důkazy funkcí a orchestrace
SECURITY_REVIEW.md                          bezpečnostní revize a plán dalších testů
package-lock.json                           uzamčené závislosti pro audit
.openai/hosting.json                       konfigurace aktuální ukázky v Sites
vercel.json                                konfigurace Vercel buildu
.vercelignore                             vyloučení lokálních klíčů z CLI uploadu
.env.example                               vzor konfigurace (bez klíčů)
```

## Ověření

```powershell
npm test
npm run build
```

Test používá náhradní odpovědi externích API a kontroluje, že výzkumník vyvolá tool, Perplexity Search dodá zdroje s ID, hodnotitel obdrží Skill, správné modely jsou přiřazeny rolím a analytik i autor skutečně dostanou data předchozího kroku. Testuje také nepovolený původ požadavku, typ a velikost těla, nebezpečné odkazy, bezpečný chybový výstup a datovou hranici při podvrženém úryvku vyhledávání. Pro ověření živého AI běhu nastavte klíč Anthropic v `.env.local` a spusťte výzkum v UI.

## API a bezpečnost

- `POST /api/run` přijímá pouze `{ "topic": "…" }` a vrací `text/event-stream`. Claude API klíč se čte výhradně ze serverového prostředí.
- `GET /api/health` vrací základní stav aplikace.
- Claude se volá přes `POST https://api.anthropic.com/v1/messages`, s top-level `system`, `messages`, `tools` a `tool_choice`. Klíč se nikdy neposílá do výstupních událostí.
- Vyhledávání volá přímo `POST https://api.perplexity.ai/search` s `PERPLEXITY_API_KEY`. Výsledky `results[]` se převádějí na zdroje `S1`, `S2` atd.
- Výsledky vyhledávání jsou nedůvěryhodný vstup. UI je vykresluje přes `textContent`, URL zdrojů se omezuje na HTTP(S), systémové prompty upozorňují na prompt injection a Skill ukládá povinnost přiznat nejistotu.
- Vstup API se kontroluje na typ, délku a původ prohlížeče; bezpečnostní hlavičky nastavuje `vercel.json`.
- Aplikace nezachovává historii běhů. Veřejná verze používá serverový klíč bez přihlášení a kvóty; zbytkové riziko a návrhy pro další provoz jsou v [SECURITY_REVIEW.md](SECURITY_REVIEW.md).

Technické důkazy hlavních funkcí jsou v [REQUIREMENTS_EVIDENCE.md](REQUIREMENTS_EVIDENCE.md).

Referenční dokumentace: [Claude Messages API](https://platform.claude.com/docs/en/api/messages/create), [tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls), [Perplexity Search API](https://docs.perplexity.ai/api-reference/search-post).

## Vercel a GitHub

Zdrojový kód je v [GitHub repozitáři](https://github.com/LukasMitlener/MultiAgentAddvery). [Produkční aplikace](https://multi-agent-research-assistant-two.vercel.app) běží na Vercelu. Projekt používá Vercel Functions (`api/`) a statický build (`public/`). Propojení GitHub → Vercel je aktivní: push do `main` automaticky vytvořil nový produkční deployment. `ANTHROPIC_API_KEY` a `PERPLEXITY_API_KEY` jsou nastavené jako produkční tajné proměnné Vercelu. `.env.local` zůstává jen na počítači, Git jej ignoruje a `.vercelignore` jej vylučuje i z přímého CLI uploadu. Kontrolu po dalším pushi lze provést pomocí `vercel ls` a `vercel inspect <deployment>`.

## Známá omezení

Vyhledávací nástroj poskytuje výsledky vyhledávání a bibliografické záznamy, neotvírá plné texty. Hodnotitel proto označuje takové zdroje `snippet_only` a snižuje jistotu. Bez Perplexity klíče je pokrytí omezeno na Wikipedii a OpenAlex. Výstupy modelu jsou částečně strukturované JSONem, ale aplikace ponechá surový text, pokud model JSON nedodrží.
