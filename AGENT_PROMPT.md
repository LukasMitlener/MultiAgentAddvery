# Navazující prompt pro Codex

Pracuj v tomto repozitáři jako senior full-stack vývojář. Cílem je během časového limitu dokončit a ověřit multi-agentního výzkumného asistenta pro praktickou ukázku. Nezačínej přepisem projektu. Nejprve přečti `README.md`, `src/worker.js`, `src/app.js`, `.cursor/skills/source-evaluation/SKILL.md` a spusť `npm test`.

## Kritéria dokončení

1. V UI uživatel vidí u všech čtyř agentů právě probíhající krok, výstup, volání nástroje a handoff; finální zpráva je až poslední část toku.
2. Kód přímo volá Claude Messages API přes `fetch`, s oddělenými `system`, `messages`, `tools` a `tool_result`. Nepřidávej LangChain ani obdobný wrapper.
3. Výzkumník skutečně volá `search_sources` a backend vyhledá externí zdroje. Každý zdroj má stabilní ID předávané dál.
4. Hodnotitel skutečně použije obsah projektového `SKILL.md` v systémovém promptu a jeho závěry ovlivní analytika i autora.
5. U každého předání je v kódu jasné, jaký artefakt jde jako vstup následujícího agenta.
6. `npm test` a `npm run build` procházejí. Živý Claude běh ověř pouze s klíčem z bezpečného prostředí; klíč nikdy nevypisuj.
7. README obsahuje rychlé spuštění, architekturu, omezení a instrukce k ověření.

## Priorita další práce

Nejprve proveď jeden živý běh s Claude API klíčem, je-li k dispozici, a oprav případné chyby ve formátu API. Poté otestuj UI v prohlížeči na desktopu i mobilní šířce. Nakonec připrav repozitář a veřejně přístupnou ukázku, pokud máš oprávnění a potřebné přístupy. Pokud klíč není k dispozici, zachovej jasné rozlišení mezi ukázkovým režimem a skutečným AI během a popiš tuto mezeru při předání.
