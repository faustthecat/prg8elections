const allowedAssemblies = new Set(["500208", "554782"]);

module.exports = async (request, response) => {
  const assembly = String(request.query.assembly || "");
  if (!allowedAssemblies.has(assembly)) return response.status(400).send("Neznámé zastupitelstvo.");
  const url = `https://volby.gov.cz/appdata/kv2026/20261009/odata/zastup/vysledky_obec_${assembly}.xml`;
  try {
    const result = await fetch(url, { headers: { "User-Agent": "PrahaVoli/1.0 (ČSÚ public election data)" } });
    if (!result.ok) return response.status(result.status).send("Oficiální výsledky zatím nejsou dostupné.");
    response.setHeader("Content-Type", "application/xml; charset=utf-8");
    response.setHeader("Cache-Control", "no-store, max-age=0");
    response.setHeader("Access-Control-Allow-Origin", "*");
    return response.status(200).send(await result.text());
  } catch (error) {
    return response.status(502).send("Nepodařilo se spojit s daty ČSÚ.");
  }
};
