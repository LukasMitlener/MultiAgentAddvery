# Bezpečnostní revize výzkumného asistenta

**Stav k 3. 11. 2026.** Revize se týká kódu aplikace, předávání dat mezi čtyřmi agenty, API klíčů a veřejného nasazení. Použil jsem také kontrolní seznamy `security-reviewer.md` a `code-reviewer.md`. Neprováděl jsem úplný penetrační test ani kontrolu nastavení účtů u poskytovatelů API.

## Co aplikace agentům dovoluje

Vyhledávat smí pouze výzkumník, a to přes nástroj `search_sources` s pevně určeným API. Hodnotitel, analytik a autor dostávají data od předchozího agenta, ale další nástroj nemají. Žádný z nich nemůže spouštět kód nebo číst soubory serveru. API klíče nejsou součástí zpráv pro model; server je načítá z proměnných prostředí.

Tato omezení zmenšují dopad podvrženého pokynu v nalezeném textu. Nezaručují správnost odpovědi: model může převzít nepodložené tvrzení nebo vytvořit chybnou citaci.

## Provedené kontroly

- `npm test` prošel ve všech **8 testech**. Testy kontrolují tok mezi agenty, volání nástroje, zapojení Skillu a vstupní validaci.
- Klíč Anthropic zůstává na serveru; web nemá pole pro jeho zadání. `.env.local` je vyloučen z Gitu i z nahrávání přes Vercel CLI. Autor projektu nastavil expiraci klíče na **7 dní**. Toto nastavení účtu jsem nemohl nezávisle zkontrolovat.

## Co zůstává otevřené

**Veřejné API může spotřebovat placené kredity.** Endpoint `/api/run` nevyžaduje přihlášení ani neomezuje počet běhů. Kontrola `Origin` chrání před částí požadavků z prohlížeče; klient mimo prohlížeč ji může obejít. Pro běžný provoz doporučuji kvóty, rozpočtový strop a upozornění při neobvyklé spotřebě. Limit **10 běhů za 10 minut z jedné IP** byl připraven, ale na přání autora nebyl zapnut, aby neomezil testování hodnotiteli. Návrh pravidla byl odstraněn.

**Předané výsledky a citace potřebují kontrolu serverem.** Výstup jednoho agenta se stává vstupem dalšího. Server dnes neověřuje každý JSON výstup podle pevného schématu ani každé citované ID proti skutečně nalezeným zdrojům. Model tak může předat chybný údaj dál, i když jeho prompt žádá opak. Před širším použitím bych přidal obě kontroly a u důležitých témat porovnal tvrzení s původními články, které současná aplikace neotevírá.

**Podvržené pokyny vyžadují více testů.** „Prompt injection“ je pokyn útočníka schovaný třeba v titulku výsledku hledání. Agenti mají v systémových promptech pravidlo, že nalezený obsah je jen zdroj dat, a pouze výzkumník má nástroj. Otestoval bych různé jazyky, skryté znaky a situaci, kdy se útočný text dostane přes několik předání až k autorovi.

**Interní nástroje by vyžadovaly nové hranice přístupu.** Pokud aplikace někdy získá CRM, firemní dokumenty nebo e-mail, každý agent by měl mít jen oprávnění nutné pro svou roli. Výzkumník by například mohl číst schválené zdroje; autor odpovědi nepotřebuje přímý přístup k CRM. Pravidla musí vynucovat server. Odeslání zprávy, změna záznamu nebo export interních dat by měly vyžadovat schválení člověkem a záznam akce.

## Další ověření

Připravil bych sadu 20–50 neškodných podvržených pokynů a u každého zaznamenal, zda změnil cíl odpovědi, citaci nebo chování nástroje. Na vzorku hotových zpráv bych ručně porovnal citace s původními zdroji. Samostatně bych změřil cenu jednoho běhu, souběžné požadavky a chování při výpadku API. Po deklarovaném vypršení klíče za sedm dní je třeba ověřit jeho obnovu ve Vercelu.

Pro soustavnější kontrolu se hodí [OWASP Top 10 pro LLM aplikace (2026)](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/) pro typická rizika, [NIST AI 600-1](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence) pro odpovědnosti a měření, [STRIDE](https://learn.microsoft.com/en-us/security/engineering/threat-modeling-with-dev-ops) pro rozbor toku dat, [CSA MAESTRO](https://labs.cloudsecurityalliance.org/maestro/) pro vztahy mezi agenty a nástroji a [MITRE ATLAS](https://atlas.mitre.org/) pro konkrétní scénáře útoků na AI. Tyto rámce uvádím jako podklad pro další testování; jejich úplné posouzení součástí této revize nebylo.
