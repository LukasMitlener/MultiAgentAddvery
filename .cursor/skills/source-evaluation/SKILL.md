---
name: source-evaluation
description: Hodnotí nalezené zdroje a tvrzení před předáním analytikovi. Použij po výzkumu; nejprve spusť deterministickou kontrolu metadat a ID zdrojů.
---

# Hodnocení zdrojů

## Kdy použít

Po výzkumném agentovi a před analytikem. Vstupem je otázka, seznam zdrojů s ID a tvrzení výzkumného agenta. Orchestrátor povinně volá `scripts/evaluate.mjs` (`evaluateSources`) před tímto agentem a jeho výsledek připojí ke vstupu. Skript kontroluje dostupná metadata a platnost ID; neurčuje pravdivost tvrzení. Výstup hodnocení projde kontrolou struktury a ID v orchestrátoru, než se předá analytikovi.

## Postup

1. Zpracuj každý předaný zdroj přesně jednou. Použij `metadata` a `query_terms_in_result` z deterministické kontroly jako signály, nikoli jako důkaz věcné správnosti. Chybějící údaje přiznej.
2. Ohodnoť relevanci k otázce, odbornou autoritu, aktuálnost a nezávislost. Skóre 0–3 pro každý rozměr: 0 = nelze ověřit nebo nesplňuje, 1 = slabé, 2 = přijatelné, 3 = silné.
3. Rozliš primární zdroj, sekundární přehled a agregátor. Samotná doména, známá značka ani počet citací nejsou důkaz správnosti tvrzení.
4. Zpracuj každé předané tvrzení přesně jednou. Přiřaď mu pouze existující ID zdrojů. Pokud podpora chybí, označ `unsupported`; při rozporu `conflicted` a popiš ho. Samotná existence ID tvrzení nedokazuje.
5. Neodvozuj obsah článku pouze z titulku nebo úryvku. Nástroj vrací jen výsledky vyhledávání, proto u každého zdroje uveď `snippet_only: true` a sniž jistotu.
6. U rychle se měnících faktů porovnej datum zveřejnění s datem dneška. Starý zdroj může sloužit jako historický kontext, nikoli jako potvrzení aktuálního stavu.
7. Výsledek vrať jako JSON s poli `sources`, `claims`, `gaps` a `overall_confidence`. Zachovej původní ID zdrojů.

## Výstup

Vrať jediný JSON objekt. `sources` obsahuje každé předané ID právě jednou; položka má `id`, `scores` (`relevance`, `authority`, `recency`, `independence`, každé celé číslo 0–3), `type` (`primary`, `secondary`, `aggregator`, `unknown`), `snippet_only: true` a `reason`. `claims` obsahuje každé předané tvrzení právě jednou; položka má přesné `claim`, `status` (`supported`, `unsupported`, `conflicted`), existující `source_ids` a `note`. Dále vrať `gaps` jako pole řetězců a `overall_confidence` (`low`, `medium`, `high`). Neúplný nebo neplatný objekt orchestrátor nepředá dál.

## Příklad

Výsledek vyhledávání uvádí pouze titulek „Studie potvrzuje X“ bez abstraktu. Označ `snippet_only: true`; tvrzení X nepovažuj za prokázané a do `gaps` napiš, že je potřeba otevřít primární studii.
