const allowedAssemblies = new Set(["500208", "554782"]);
const allowedYears = new Set(["2022", "2026"]);

module.exports = async (request, response) => {
  const assembly = String(request.query.assembly || "");
  const year = String(request.query.year || "2026");
  if (!allowedAssemblies.has(assembly) || !allowedYears.has(year)) return response.status(400).send("Neznámé zastupitelstvo nebo rok voleb.");
  const url = year === "2022"
    ? `https://www.volby.cz/pls/kv2022/vysledky_obec?cislo_obce=${assembly}`
    : `https://volby.gov.cz/appdata/kv2026/20261009/odata/zastup/vysledky_obec_${assembly}.xml`;
  try {
    // Fetch headers must be ByteString-safe; keep this value ASCII-only.
    const result = await fetch(url, { headers: { "User-Agent": "PrahaVoli/1.0 (public election data)" } });
    if (!result.ok) return response.status(result.status).send("Oficiální výsledky zatím nejsou dostupné.");
    const body = await result.text();
    if (year === "2022" && !/<\?xml|<OBEC\b|<VYSLEDKY\b/i.test(body)) {
      console.error("ČSÚ returned a non-XML historical response", { url, contentType: result.headers.get("content-type") });
      return response.status(502).send("Archivní zdroj ČSÚ nevrátil XML výsledků. Zkuste to prosím později.");
    }
    response.setHeader("Content-Type", "application/xml; charset=utf-8");
    response.setHeader("Cache-Control", "no-store, max-age=0");
    response.setHeader("Access-Control-Allow-Origin", "*");
    return response.status(200).send(body);
  } catch (error) {
    console.error("ČSÚ fetch failed", { url, message: error?.message, cause: error?.cause?.message });
    response.setHeader("Cache-Control", "no-store, max-age=0");
    const details = error?.cause?.message || error?.message || "neznámá chyba připojení";
    return response.status(502).send(`Nepodařilo se spojit s daty ČSÚ. Technický detail: ${details}`);
  }
};
