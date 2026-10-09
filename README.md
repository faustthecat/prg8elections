# Praha volí

Mobilní dashboard průběžných komunálních výsledků pro Prahu 8 a Zastupitelstvo hl. m. Prahy. Data se kontrolují každých 15 sekund; samotné otevřené XML ČSÚ má dle dokumentace cache přibližně 60 sekund.

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

Zdroj: [ČSÚ — otevřená data komunálních voleb 2026](https://volby.gov.cz/opendata/kv2026/kv2026_opendata.htm). Aplikace čte oficiální XML jednotlivých zastupitelstev podle kódů z registru ČSÚ: Praha 8 `500208`, Praha `554782`.

Počty sečtených okrsků, platné hlasy, podíly a přidělené mandáty se zobrazují podle XML ČSÚ. Před oficiálním přidělením mandátů aplikace nevykresluje vlastní odhad. Při nedostupnosti zdroje zůstávají hodnoty prázdné a zobrazí se informace o chybě.
