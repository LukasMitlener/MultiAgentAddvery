# Bezpečnostní revize výzkumného asistenta

**Datum:** 3. 11. 2026
**Rozsah:** aplikace, čtyři agenti, jejich nástroje, API klíče a veřejné nasazení. Revize vychází také z dodaných kontrolních seznamů `security-reviewer.md` a `code-reviewer.md`. Nejde o úplný penetrační test.

## Výsledek stručně

Agenti mají omezené možnosti. Pouze výzkumník může spustit vyhledávání; ostatní agenti pracují s výsledky předanými aplikací. Nemohou spouštět kód, číst soubory ani volat libovolné webové adresy. API klíče zůstávají na serveru.

Největší otevřené riziko je veřejné spuštění výzkumu bez přihlášení a bez limitu počtu běhů. Někdo by tak mohl spotřebovat placené API. Ochrana proti podvrženým pokynům ve vyhledaných textech je přiměřená pro ukázkovou aplikaci, ale žádný pokyn modelu nezaručí úplnou odolnost.

## Co bylo ověřeno

- **Funkčnost:** všech 8 automatických testů prošlo. Veřejná aplikace dokončila celý běh: 8 zdrojů, 4 výstupy agentů a 3 předání mezi nimi.
- **Podvržený pokyn:** při jednom živém testu obsahoval výsledek hledání pokyn, aby asistent ignoroval otázku a vložil do odpovědi kontrolní text. Finální odpověď jej neobsahovala. Jeden případ ale nestačí k tvrzení, že jsou všechny podobné útoky zablokované.
- **Klíče:** Claude klíč se načítá na serveru. Formulář jej nevyžaduje a API nepřijímá klíč od návštěvníka. `.env.local` je vyloučen z Gitu i z nahrávání přes Vercel CLI. Autor projektu nastavil expiraci Anthropic klíče na **7 dní**; nastavení účtu nebylo v této revizi nezávisle ověřeno.
- **Vstup a zobrazení:** aplikace omezuje délku otázky a velikost požadavku, odmítá nepovolené typy dat a nebezpečné odkazy. Text od modelu se zobrazuje jako text, nikoli jako spustitelné HTML. Chyby poskytovatele nevracejí návštěvníkovi surovou odpověď.
- **Závislosti:** `npm audit --audit-level=high` nenašel zranitelnosti. Projekt nemá provozní npm závislosti.

## Co bych zlepšil před ostrým provozem

1. **Omezit spotřebu API.** Přidat kvóty, rozpočtový strop a upozornění na neobvyklý provoz; u neveřejné aplikace také přihlášení. Kontrola webového `Origin` není náhradou přihlášení. Limit 10 spuštění za 10 minut z jedné IP byl připraven, ale **nebyl aktivován na přání autora**, aby nebránil testování aplikace hodnotiteli. Návrh pravidla byl odstraněn. K limitu se vrátit po hodnocení.
2. **Kontrolovat předávání a citace.** Výsledek jednoho agenta vstupuje do práce dalšího. Server by měl před každým předáním zkontrolovat požadovanou strukturu dat a ověřit, že citovaná ID skutečně patří nalezeným zdrojům. Dnes může model vytvořit nepodložené tvrzení nebo chybnou citaci.
3. **Opakovat testy podvržených pokynů.** „Prompt injection“ znamená škodlivý pokyn schovaný například v titulku nebo úryvku nalezeného článku. Současné systémové pokyny říkají agentům, aby takový text brali jako data, a omezený vyhledávací nástroj snižuje dopad chyby. Je třeba otestovat více jazyků, skrytých znaků a útoků přenášených přes několik agentů.
4. **Při připojení interních nástrojů omezit oprávnění každého agenta zvlášť.** Například výzkumník může pouze číst povolené zdroje; autor odpovědi nepotřebuje přístup do CRM ani e-mailu. Práva musí vynucovat server, nikoli textové pokyny modelu. Odeslání zprávy, změna dat nebo export interních informací by vyžadovaly schválení člověkem a záznam akce. Tajné údaje se nesmí dostat do promptů ani výstupů pro návštěvníka.

## Jak pokračovat v ověřování

- Připravit sadu 20–50 neškodných pokusů o podvržení pokynů a měřit, kolikrát se změní cíl odpovědi nebo citace.
- Na vzorku odpovědí ručně porovnat tvrzení a odkazy s původními zdroji. Rozlišit, zda agent viděl celý článek, nebo jen úryvek z vyhledávání.
- Vyzkoušet souběžné požadavky, výpadek poskytovatele a celkové náklady na jeden běh. Po vypršení sedmidenního klíče zkontrolovat jeho obnovu ve Vercelu.
- Pokud přibudou interní nástroje, otestovat, že každý agent skutečně nedokáže vykonat nepovolenou operaci ani odeslat interní data ven.

Pro úplnější revizi lze použít [OWASP Top 10 pro LLM aplikace (2026)](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/) jako seznam typických rizik (zejména podvržené pokyny, únik dat, příliš široká oprávnění, neomezená spotřeba a chybné výstupy). [NIST AI 600-1](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence) pomůže určit vlastníky rizik a pravidla měření; [STRIDE](https://learn.microsoft.com/en-us/security/engineering/threat-modeling-with-dev-ops) projít možné útoky v toku dat; [CSA MAESTRO](https://labs.cloudsecurityalliance.org/maestro/) posoudit hranice mezi agenty a nástroji; [MITRE ATLAS](https://atlas.mitre.org/) připravit konkrétní testovací scénáře útoků na AI.

**Závěr:** Pro současnou veřejnou ukázku jsou pravomoci agentů a práce s klíči omezené. Před širším provozem mají nejvyšší prioritu náklady na veřejné API a automatická kontrola předaných dat a citací.
