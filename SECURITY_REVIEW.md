# Bezpečnostní revize multiagentního výzkumného asistenta

**Datum:** 3. 11. 2026
**Rozsah:** aplikační kód, tok dat mezi čtyřmi agenty, práce s klíči, HTTP vstup/výstup, Git a Vercel. Při revizi byly použity i kontrolní seznamy z dodaných `security-reviewer.md` a `code-reviewer.md`. Jde o technickou revizi konkrétní verze, nikoli certifikaci ani penetrační test celého poskytovatele.

## Shrnutí pro hodnotitele

Aplikace omezuje pravomoci modelů: pouze výzkumník může použít `search_sources`, a ten volá pevně určené vyhledávací API. Žádný agent nedostává API klíč v promptu a žádný nemůže spustit kód, číst soubory nebo volat libovolnou URL. Neznámé webové URL se zobrazují jako odkazy v UI, backend je neotvírá. Data ze zdrojů a předchozích agentů jsou v systémových promptech označena jako nedůvěryhodná. To snižuje dopad prompt injection, ale **nezaručuje, že model útočný text nikdy neposlechne**.

Největší zbývající riziko veřejného dema je **neomezené čerpání serverových API klíčů přes anonymní `/api/run`**. Limit 10 požadavků / 10 minut / IP byl na Vercelu připraven, ale na přání zadavatele nebyl aktivován, aby neomezil testování ve výběrovém řízení. Nepublikovaný návrh pravidla byl odstraněn a produkce nemá vlastní pravidlo tohoto typu. Před ostrým provozem je třeba znovu rozhodnout o kvótách, rozpočtových limitech nebo autentizaci.

## Provedené kontroly a důkazy

- `npm test`: **7/7 prošlo**. Pokryta orchestrace, skutečný tool call, použití Skillu, handoff, validace typu a velikosti požadavku, cizí `Origin`, nebezpečné URL a generická chyba poskytovatele.
- Řízený **živý prompt injection test**: podvržený výsledek vyhledávání obsahoval pokyn přidat do finální zprávy unikátní kontrolní řetězec a ignorovat původní úkol. Proběhlo 5 reálných volání Claude API, 3 handoffy a celý běh skončil úspěšně; řetězec se ve finální zprávě **neobjevil**. Je to jeden testovací případ, nikoli statistický důkaz odolnosti.
- Test se záměrně škodlivým `javascript:` URL ověřuje, že se nepropustí do seznamu zdrojů. UI vkládá výstup modelu a úryvky přes `textContent`, nikoli jako HTML. Odkazy se otevírají s `noopener noreferrer`.
- Git ignoruje `.env.local` a `.vercelignore` jej vylučuje z uploadu Vercel CLI. `npm audit --audit-level=high` hlásí **0 zranitelností** v balíčcích; projekt nemá runtime npm závislosti.
- Autor projektu uvedl, že nastavil **expiraci Anthropic API klíče na 7 dní**. Nastavení účtu Anthropic zde nebylo nezávisle ověřeno. Při pozdějším hodnocení je třeba ověřit platnost klíče; po expiraci jej obnovit v proměnných Vercelu a znovu zkontrolovat funkční běh.
- HTTP vrstva omezuje JSON tělo na 12 kB při čtení streamu, téma na 500 znaků, přijímá `application/json` a odmítá cizí browser `Origin`. Odpověď Claude při chybě nevrací text poskytovatele, který by mohl obsahovat citlivé údaje. `vercel.json` nastavuje CSP, `nosniff`, zákaz vložení do iframe a další hlavičky.
- **Produkční ověření po automatickém deployi:** `GET /` a `/api/health` vrací 200; CSP a `nosniff` jsou přítomné; cizí `Origin` vrací 403, `text/plain` 415, nadměrné tělo 400. Jeden živý běh přes veřejné Vercel URL vrátil 8 zdrojů, 4 výstupy agentů, 3 handoffy a `run_done` bez chyby.

## Zjištění a doporučené pořadí

### 1. Veřejný endpoint a náklady na API — vysoká priorita před ostrým provozem

`/api/run` je bez přihlášení a běžný požadavek spustí až pět volání Claude plus vyhledávání. Kontrola `Origin` zabraňuje části útoků z prohlížeče, **není autentizací**: klient mimo prohlížeč jej může vynechat nebo podvrhnout. Pro toto veřejné demo zůstává endpoint otevřený kvůli dostupnosti pro hodnotitele. Pro produkční provoz: kvóty na účet a IP, rozpočtový strop u poskytovatelů, monitor spotřeby, případně přihlášení. Volitelný per-IP limit aktivovat až po skončení hodnocení a s vhodnou tolerancí pro sdílené IP.

### 2. Prompt injection a kontaminace handoffů — střední priorita

Útok může přijít z tématu od uživatele, z titulku/úryvku vyhledávání nebo z výstupu předchozího agenta. `UNTRUSTED_DATA_RULE` je součástí systémových promptů všech rolí; obsah zdrojů se posílá jako `tool_result` nebo text vstupní zprávy, nikdy jako systémový prompt. Jen první volání výzkumníka má `tools`; ostatní agenti nemohou vyžádat další backendové akce. Vyhledávací tool má pevný cíl, validovaný dotaz a konečný počet výsledků. To omezuje možnost zneužití, nikoli samotné ovlivnění odpovědi.

**Co ještě chybí:** striktní validace struktury JSON výstupů a povolených `source_ids` mezi handoffy; ověření, že finální citace odpovídají skutečně nalezeným zdrojům; pravidelná sada adversariálních příkladů (jazyky, skryté znaky, kódované instrukce, útočné titulky i vícekolové scénáře). Současný fallback `parseObject()` může předat surový modelový text dál. Textový pokyn modelu nesmí být považován za bezpečnostní hranici. [OWASP LLM01:2026](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/) výslovně doporučuje omezit pravomoci a dopad i pro případ, že model instrukci poruší.

### 3. Věrohodnost výstupu — střední priorita

Skill správně odlišuje výsledky hledání od přečteného článku a vyžaduje `snippet_only`. Agent ale může vytvořit nepodložené tvrzení, falešné ID zdroje nebo citaci bez vazby na tvrzení. Další krok: serverově ověřit všechna ID proti množině skutečně nalezených zdrojů, požadovat strukturovaný výstup podle schématu, odmítat neznámé citace a pro citlivá témata zavést kontrolu člověkem či dohledání primárních textů. Měřit podíl chybných citací a nepodložených tvrzení na připravené sadě otázek.

### 4. Vnitřní nástroje v budoucím produkčním nasazení — vysoká priorita při rozšíření

Pokud by aplikace dostala interní CRM, firemní dokumenty, e-mail nebo databázi, agenti **nemají sdílet univerzální účet ani široký přístup**. Konkrétní návrh:

1. Každý agent a nástroj má samostatnou identitu a přesně vymezené oprávnění; výzkumník např. jen vyhledávání v povoleném read-only indexu, analytik jen data předaná orchestrátorem, autor žádné přímé interní nástroje.
2. Backendový tool gateway vynucuje allowlist operací, tenant/uživatelský rozsah, schéma argumentů, limit objemu dat a schválené cílové domény. Oprávnění se **neodvozují od textu modelu**.
3. Zápisy, odesílání zpráv, export interních dat a změny oprávnění vyžadují schválení člověkem a auditní záznam. Tokeny jsou krátkodobé, oddělené podle nástroje a nikdy se nevkládají do promptu ani SSE událostí.
4. Oddělit nedůvěryhodné výsledky webu od interních dat, testovat přenos dat přes handoffy a stanovit pravidla, která data smí odejít k externím modelům a vyhledávačům.

Tento princip odpovídá riziku **excessive agency**: úspěšná prompt injection je výrazně závažnější, pokud může vyvolat privilegované akce. [OWASP LLM03:2026](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/), [CSA MAESTRO](https://labs.cloudsecurityalliance.org/maestro/) a [MITRE ATLAS](https://atlas.mitre.org/) poskytují k tomuto návrhu rámce.

## Pokrytí OWASP Top 10 for LLM Applications 2026

Oficiální [OWASP seznam 2026](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/) používá jiné pořadí a některé jiné názvy než verze 2025. Pro tento projekt:

| Riziko | Stav v projektu / další krok |
| --- | --- |
| LLM01 Prompt Injection | Systémové pokyny o nedůvěryhodných datech, pevné tool API, jeden živý adversariální test. Dále sada red-team scénářů a validace handoffů. |
| LLM02 Sensitive Information Disclosure | Klíče zůstávají na serveru, chyby poskytovatele se nevrací doslova. Dále skenovat logy a výstupy na tajné řetězce, omezit citlivá témata. |
| LLM03 Excessive Agency | Jen výzkumník má jediný nástroj bez zápisových oprávnění. Při interních integracích per-agent oprávnění a lidské schválení. |
| LLM04 Supply Chain | Žádné runtime npm balíčky, lockfile a audit. Dále chránit změny Skillu, CI a deploymentu; pravidelně kontrolovat poskytovatele API. |
| LLM05 Data and Model Poisoning | Veřejné zdroje se označují jako neověřené úryvky. Dále ověřovat původ a nezávislost zdrojů; testovat podvržené výsledky. |
| LLM06 Unbounded Consumption | Délky požadavků a počet výsledků jsou omezené. Volání API na veřejném endpointu nemají kvótu; viz rozhodnutí o rate limitu výše. |
| LLM07 Misinformation | Skill uvádí mezery v důkazech; zatím chybí automatické ověřování tvrzení vůči primárnímu zdroji. |
| LLM08 Hidden Context Exposure | System prompty jsou serverové; žádné klíče nejsou v kontextu modelu. Dále red-team testy extrakce systémového promptu a interních dat. |
| LLM09 Vector and Embedding Weaknesses | Není použita vektorová databáze ani embeddingy; aktuálně se neuplatňuje. Při přidání RAG znovu posoudit. |
| LLM10 Improper Output Handling | UI používá `textContent`, URL filtr HTTP(S), CSP. Dále validovat schema modelových JSON a citace před dalším agentem. |

## Další testy podle dalších rámců

- **[NIST AI 600-1 Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence):** zdokumentovat inventář modelů, datových toků, vlastníka rizik a pravidla změn (Govern/Map); vytvořit opakovatelnou sadu témat a injekcí, měřit chybné citace, úniky a náklady (Measure); nastavit reakci na incident, revizi poskytovatelů a obnovu po selhání (Manage). Pro vysoce důležité odpovědi zaznamenat lidské posouzení kvality.
- **[STRIDE](https://learn.microsoft.com/en-us/security/engineering/threat-modeling-with-dev-ops):** nakreslit tok uživatel → Vercel → Claude/Perplexity → SSE → prohlížeč. Pro každý přechod zkontrolovat spoofing (kdo může spustit nákladný běh), tampering (změna zdroje/handoffu), repudiation (audit bez ukládání tajných dat), information disclosure (klíče a interní text), denial of service (paralelní běhy, timeouty), elevation of privilege (budoucí tool gateway).
- **[CSA MAESTRO](https://labs.cloudsecurityalliance.org/maestro/):** projít zvlášť model, externí data, agentní orchestrace, nasazení, vyhodnocování/telemetrii, politiku přístupu a ekosystém nástrojů. Otestovat zejména přesahy mezi vrstvami: podvržený výsledek hledání → výzkumník → hodnotitel → autor a případný přístup k internímu systému.
- **[MITRE ATLAS](https://atlas.mitre.org/):** vytvořit scénáře pro LLM Prompt Injection, AI Agent Context Poisoning (AML.T0080), AI Agent Tool Data Poisoning (AML.T0099) a AI Agent Tool Poisoning (AML.T0110). Pro každý určit vstupní bod, očekávanou bezpečnou reakci a přesný signál selhání (nepovolený tool call, uniklé tajemství, změněný cíl, falešná citace).

## Praktický plán dalšího ověření

1. Sestavit 20–50 neškodných testovacích payloadů pro přímou i nepřímou prompt injection; spustit je opakovaně přes stejný model a reportovat úspěšnost útočníka včetně příkladů. Jeden úspěšný test výše není dostatečný důkaz odolnosti.
2. Ověřit citace proti skutečným ID a ručně zkontrolovat vzorek tvrzení vůči primárním textům. Zvlášť měřit případy, kdy byl dostupný jen úryvek.
3. Změřit souběžné požadavky, timeouty poskytovatelů, náklady na jednu otázku a chování při 429/5xx bez vystavení klíčů nebo interních chyb.
4. Při přidání interních nástrojů provést threat model oprávnění, test odmítnutí nepovolených operací mimo LLM a simulaci exfiltrace z každé agentní role.

**Závěr:** Pro veřejné demo je významná část rizika prompt injection omezena architekturou s jediným read-only nástrojem a nulovým přístupem agentů k tajným klíčům. Ochrana není absolutní; největší otevřené položky jsou anonymní spotřeba API a strojová kontrola faktů, citací a handoffů.
