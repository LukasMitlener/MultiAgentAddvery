# Bezpečnostní revize výzkumného asistenta

**Stav k 12. 11. 2026.** Revize se týká kódu aplikace, předávání dat mezi čtyřmi agenty, API klíčů a veřejného nasazení. Použil jsem také kontrolní seznamy `security-reviewer.md` a `code-reviewer.md`. Neprováděl jsem úplný penetrační test ani kontrolu nastavení účtů u poskytovatelů API.

## Co aplikace agentům dovoluje

Vyhledávat smí pouze výzkumník, a to přes nástroj `search_sources` s pevně určeným API. Hodnotitel, analytik a autor dostávají data od předchozího agenta, ale další nástroj nemají. Žádný z nich nemůže spouštět kód nebo číst soubory serveru. API klíče nejsou součástí zpráv pro model; server je načítá z proměnných prostředí.

Tato omezení zmenšují dopad podvrženého pokynu v nalezeném textu. Server navíc kontroluje strukturu výstupů a ID zdrojů před jejich předáním. Ani to nezaručuje správnost odpovědi: model může převzít nepodložené tvrzení.

## Provedené kontroly

- `npm test` prošel ve všech **13 testech**. Testy zahrnují více vyhledání, skript Skillu, odmítnutí prázdného hodnocení, useknuté odpovědi a neplatné citace. Externí API jsou v těchto testech nahrazena simulovanými odpověďmi.
- Klíč Anthropic zůstává na serveru; web nemá pole pro jeho zadání. `.env.local` je vyloučen z Gitu i z nahrávání přes Vercel CLI. Autor projektu nastavil expiraci klíče na **7 dní**. Toto nastavení účtu jsem nemohl nezávisle zkontrolovat.

## Co zůstává otevřené

**Veřejné API může spotřebovat placené kredity.** Endpoint `/api/run` nevyžaduje přihlášení ani neomezuje počet běhů. Výzkum nyní provádí nejméně dvě hledání a více volání modelu, takže cena jednoho běhu může vzrůst. Kontrola `Origin` chrání před částí požadavků z prohlížeče; klient mimo prohlížeč ji může obejít. Pro běžný provoz doporučuji kvóty, rozpočtový strop a upozornění při neobvyklé spotřebě. Limit **10 běhů za 10 minut z jedné IP** byl připraven, ale na přání autora nebyl zapnut, aby neomezil testování hodnotiteli. Návrh pravidla byl odstraněn.

**Správnost tvrzení zůstává k ověření.** Server nyní odmítá neúplný JSON mezi agenty a finální citace na neznámá ID zdrojů. Kontrola ID ale nepotvrzuje, že citovaný zdroj tvrzení skutečně podporuje. Aplikace navíc neotevírá celé články. U důležitých témat je proto potřeba ručně porovnat tvrzení s původními texty a měřit chybné citace na sadě otázek.

**Podvržené pokyny vyžadují více testů.** „Prompt injection“ je pokyn útočníka schovaný třeba v titulku výsledku hledání. Agenti mají v systémových promptech pravidlo, že nalezený obsah je jen zdroj dat, a pouze výzkumník má nástroj. Vyhledávací loop má limit tří volání. Otestoval bych různé jazyky, skryté znaky a situaci, kdy se útočný text dostane přes několik předání až k autorovi.

**Interní nástroje by vyžadovaly nové hranice přístupu.** Pokud aplikace někdy získá CRM, firemní dokumenty nebo e-mail, každý agent by měl mít jen oprávnění nutné pro svou roli. Výzkumník by například mohl číst schválené zdroje; autor odpovědi nepotřebuje přímý přístup k CRM. Pravidla musí vynucovat server. Odeslání zprávy, změna záznamu nebo export interních dat by měly vyžadovat schválení člověkem a záznam akce.

**Prompty a zprávy jsou záměrně viditelné v UI.** Server do záznamu neposílá HTTP hlavičky ani API klíče. Do systémových promptů se proto nesmějí přidávat tajné údaje. Pokud by aplikace později pracovala s interními daty, bude nutné před zobrazením záznamu ověřit oprávnění uživatele a citlivé části skrýt.

## Další ověření

Připravil bych sadu 20–50 neškodných podvržených pokynů a u každého zaznamenal, zda změnil cíl odpovědi, citaci nebo chování nástroje. Na vzorku hotových zpráv bych ručně porovnal citace s původními zdroji. Samostatně bych změřil cenu jednoho běhu, souběžné požadavky a chování při výpadku API. Po deklarovaném vypršení klíče za sedm dní je třeba ověřit jeho obnovu ve Vercelu.

Pro soustavnější kontrolu se hodí [OWASP Top 10 pro LLM aplikace (2026)](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/) pro typická rizika, [NIST AI 600-1](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence) pro odpovědnosti a měření, [STRIDE](https://learn.microsoft.com/en-us/security/engineering/threat-modeling-with-dev-ops) pro rozbor toku dat, [CSA MAESTRO](https://labs.cloudsecurityalliance.org/maestro/) pro vztahy mezi agenty a nástroji a [MITRE ATLAS](https://atlas.mitre.org/) pro konkrétní scénáře útoků na AI. Tyto rámce uvádím jako podklad pro další testování; jejich úplné posouzení součástí této revize nebylo.
