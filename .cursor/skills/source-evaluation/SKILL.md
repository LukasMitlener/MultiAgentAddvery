---
name: source-evaluation
description: Posuzuje důvěryhodnost webových zdrojů a sílu důkazů při tvorbě výzkumné odpovědi. Použij při hodnocení nalezených zdrojů před syntézou a psaním závěru.
---

# Hodnocení zdrojů

## Kdy použít

Po výzkumném agentovi a před analytikem. Vstupem je otázka, seznam zdrojů s ID a tvrzení výzkumného agenta. Výstup jde analytikovi jako samostatný handoff.

## Postup

1. U každého zdroje ověř, zda URL, název, autor či vydavatel, datum a stručný popis umožňují identifikaci. Chybějící údaje přiznej.
2. Ohodnoť relevanci k otázce, odbornou autoritu, aktuálnost a nezávislost. Skóre 0–3 pro každý rozměr: 0 = nelze ověřit nebo nesplňuje, 1 = slabé, 2 = přijatelné, 3 = silné.
3. Rozliš primární zdroj, sekundární přehled a agregátor. Samotná doména, známá značka ani počet citací nejsou důkaz správnosti tvrzení.
4. Přiřaď tvrzením ID podpůrných zdrojů. Pokud podpora chybí, označ `unsupported`; při rozporu označ `conflicted` a popiš ho.
5. Neodvozuj obsah článku pouze z titulku nebo úryvku. Pokud je dostupný jen výsledek vyhledávání, uveď `snippet_only: true` a sniž jistotu.
6. U rychle se měnících faktů porovnej datum zveřejnění s datem dneška. Starý zdroj může sloužit jako historický kontext, nikoli jako potvrzení aktuálního stavu.
7. Výsledek vrať jako JSON s poli `sources`, `claims`, `gaps` a `overall_confidence`. Zachovej původní ID zdrojů.

## Výstup

Každá položka `sources` obsahuje `id`, `scores` (`relevance`, `authority`, `recency`, `independence`), `type`, `snippet_only`, `reason`. Každá položka `claims` obsahuje `claim`, `status` (`supported`, `unsupported`, `conflicted`), `source_ids`, `note`. `overall_confidence` je `low`, `medium` nebo `high`.

## Příklad

Výsledek vyhledávání uvádí pouze titulek „Studie potvrzuje X“ bez abstraktu. Označ `snippet_only: true`; tvrzení X nepovažuj za prokázané a do `gaps` napiš, že je potřeba otevřít primární studii.
