# Multi-agentní výzkumný asistent

Webová ukázka čtyř explicitně orchestrovaných agentů. Uživatel zadá otázku a v UI sleduje stav každého agenta, volání nástroje, jeho výsledky, tři předání mezi agenty a finální zprávu. Aplikace volá Claude Messages API přímo přes `fetch`; nepoužívá LangChain ani agentní framework.

## Rychlé spuštění

Potřebujete Node.js 20+ a klíče Anthropic a Perplexity. Projekt nemá externí npm závislosti.

```powershell
# Vyplňte ANTHROPIC_API_KEY a PERPLEXITY_API_KEY v existujícím .env.local.
npm run dev
```

Otevřete `http://localhost:8787`. Vývojový server načítá `.env.local` (případně `.env`). Claude klíč lze také zadat přímo do formuláře pro jeden běh; backend jej neukládá. Bez něj lze použít **Ukázkový režim**: ten skutečně hledá externí zdroje, ale výstupy agentů jen demonstruje a jasně je tak označuje. Bez Perplexity klíče slouží jako záložní zdroje Wikipedia a OpenAlex.

### Konfigurace API a modelů

- `ANTHROPIC_API_KEY` — serverový klíč pro Claude API.
- `PERPLEXITY_API_KEY` — serverový klíč pro Perplexity Search API; výsledky obsahují URL, titulek a úryvek, nikoli hotovou odpověď.
- `CLAUDE_FAST_MODEL` — výchozí `claude-haiku-5-5` pro výzkumníka a hodnotitele.
- `CLAUDE_DEEP_MODEL` — výchozí `claude-sonnet-5-5` pro analytika a autora.
- `PORT` — výchozí `8787` pro místní server.

Haiku je zde zvolen pro krátké kroky s nástrojem, extrakci a hodnocení podle rubriky; Sonnet pro syntézu a psaní. Podle [aktuálního přehledu Anthropic](https://platform.claude.com/docs/en/models/overview) je Haiku určen pro rychlé úlohy a Sonnet nabízí vyváženou kombinaci rychlosti a schopností. OpenAI ani Gemini nejsou pro toto zadání potřeba: přidání dalšího poskytovatele by zvětšilo počet integrací, ale nepřidalo nový typ kroku orchestrace.

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
src/brand.css                              barevná vrstva podle Addvery
src/app.js                                 zobrazení průběhu
api/run.mjs, api/health.mjs                Vercel Functions adapter
.cursor/skills/source-evaluation/SKILL.md  vlastní Skill
scripts/build.mjs                          sestavení balíčku bez závislostí
scripts/dev.mjs                            místní server
tests/pipeline.test.mjs                    test handoffů, Skillu a tool callu
.openai/hosting.json                       konfigurace aktuální ukázky v Sites
vercel.json                                konfigurace Vercel buildu
.env.example                               vzor konfigurace (bez klíčů)
```

## Ověření

```powershell
npm test
npm run build
```

Test používá náhradní odpovědi externích API a kontroluje, že výzkumník vyvolá tool, Perplexity Search dodá zdroje s ID, hodnotitel obdrží Skill, správné modely jsou přiřazeny rolím a analytik i autor skutečně dostanou data předchozího kroku. Pro ověření živého AI běhu vložte oba klíče do `.env.local` a spusťte výzkum v UI.

## API a bezpečnost

- `POST /api/run` přijímá `{ "topic": "…", "apiKey": "…", "demo": false }` a vrací `text/event-stream`.
- `GET /api/health` vrací základní stav aplikace.
- Claude se volá přes `POST https://api.anthropic.com/v1/messages`, s top-level `system`, `messages`, `tools` a `tool_choice`. Klíč se nikdy neposílá do výstupních událostí.
- Vyhledávání volá přímo `POST https://api.perplexity.ai/search` s `PERPLEXITY_API_KEY`. Výsledky `results[]` se převádějí na zdroje `S1`, `S2` atd.
- Výsledky vyhledávání jsou nedůvěryhodný vstup. UI je vykresluje přes `textContent`, URL zdrojů se omezuje na HTTP(S) a Skill ukládá povinnost přiznat nejistotu.
- Aplikace nezachovává historii běhů. Pro veřejné nasazení se serverovým klíčem doplňte autentizaci a omezení počtu požadavků, nebo používejte klíč zadaný uživatelem.

Referenční dokumentace: [Claude Messages API](https://platform.claude.com/docs/en/api/messages/create), [tool use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls), [Perplexity Search API](https://docs.perplexity.ai/api-reference/search-post).

## Vercel a GitHub

Projekt je připraven pro Vercel Functions (`api/`) a statický build (`public/`). Po přihlášení přes Vercel CLI spusťte v kořeni repozitáře `vercel link` a `vercel git connect`; tím se Vercel projekt napojí na GitHub repozitář a push do větve spustí nové nasazení. Pro produkční běh vložte `ANTHROPIC_API_KEY` a `PERPLEXITY_API_KEY` do **Environment Variables** projektu ve Vercelu, ne do Gitu. `.env.local` zůstává jen na vašem počítači. Tyto kroky jsou připravené, ale dokud není projekt připojen k účtu Vercel a klíče nejsou vloženy, automatický redeploy ani živý AI běh na Vercelu nejsou aktivní.

## Známá omezení

Vyhledávací nástroj poskytuje výsledky vyhledávání a bibliografické záznamy, neotvírá plné texty. Hodnotitel proto označuje takové zdroje `snippet_only` a snižuje jistotu. Bez Perplexity klíče je pokrytí omezeno na Wikipedii a OpenAlex. Výstupy modelu jsou částečně strukturované JSONem, ale aplikace ponechá surový text, pokud model JSON nedodrží.
