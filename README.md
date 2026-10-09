# Praha volí

Mobilní dashboard komunálních výsledků pro Prahu 8 a Zastupitelstvo hl. m. Prahy. Průběžné výsledky 2026 kontroluje každých 15 sekund; samotné otevřené XML ČSÚ má dle dokumentace cache přibližně 60 sekund. Konečné výsledky 2022 se načtou po přepnutí na archivní záložku.

## Spuštění

Projekt je připravený jako statická stránka s Vercel funkcí, bez build kroku. Pro lokální spuštění doporučujeme Vercel CLI:

```sh
npm i -g vercel
vercel dev
```

Otevřete URL, kterou vypíše `vercel dev`. Pokud otevřete pouze `index.html` přímo ze souborového systému, API proxy nebude dostupná.

## Nasazení na GitHub a Vercel

1. Vytvořte prázdný GitHub repozitář a nahrajte do něj soubory tohoto projektu.
2. Ve Vercelu zvolte **Add New → Project**, propojte GitHub repozitář a potvrďte nasazení.
3. Není potřeba nastavovat proměnné prostředí ani build command. Vercel obslouží `index.html`, statické soubory a funkci `api/results.js`.

Každý push do hlavní větve následně vytvoří nové nasazení.

## Zdroj a výpočet výsledků

Zdroje: [ČSÚ — otevřená data komunálních voleb 2026](https://volby.gov.cz/opendata/kv2026/kv2026_opendata.htm) a [ČSÚ — otevřená data komunálních voleb 2022](https://volby.gov.cz/opendata/kv2022/kv2022_opendata.htm). Aplikace čte oficiální XML jednotlivých zastupitelstev podle kódů ČSÚ: Praha 8 `500208`, Praha `554782`. Pro rok 2022 používá endpoint s parametrem data voleb `20220923`.

Počty sečtených okrsků, platné hlasy, podíly a přidělené mandáty se zobrazují podle XML ČSÚ. Před oficiálním přidělením mandátů aplikace nevykresluje vlastní odhad. Při nedostupnosti zdroje zůstávají hodnoty prázdné a zobrazí se informace o chybě.

TOP 10 kandidátů za rok 2022 vychází z registru KVRK/KVROS ČSÚ. Pro rok 2026 aplikace čte stejná kandidátní pole z aktuálního registru; pokud ČSÚ ještě nezveřejnilo individuální hlasy, přehled zobrazí stav čekání. Počty představují všechny hlasy připsané kandidátovi, včetně hlasů z označení celé kandidátky.
