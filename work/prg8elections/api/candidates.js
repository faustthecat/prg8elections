const historical = require("../data/top-candidates-2022.json");
const allowedAssemblies = new Set(["500208", "554782"]);

function parseCsvRow(line) {
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else field += char;
  }
  row.push(field);
  return row;
}

function parseCsv(text, onRow, targetAssembly = "") {
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line || (index > 0 && targetAssembly && !line.includes(`,${targetAssembly},`))) continue;
    onRow(parseCsvRow(line));
  }
}

function fieldIndexes(header) {
  return Object.fromEntries(header.map((name, index) => [name.replace(/^\uFEFF/, "").trim(), index]));
}
function value(row, indexes, name) { return row[indexes[name]] ?? ""; }

module.exports = async (request, response) => {
  const assembly = String(request.query.assembly || "");
  const year = String(request.query.year || "2026");
  if (!allowedAssemblies.has(assembly) || !["2022", "2026"].includes(year)) {
    return response.status(400).json({ error: "Neznámé zastupitelstvo nebo rok voleb." });
  }

  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (year === "2022") {
    response.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    return response.status(200).json({ available: true, lists: historical.assemblies[assembly]?.lists || [] });
  }

  // Candidate-level vote and mandate fields are published in the official
  // registry after results are processed; cache the national CSV snapshot.
  response.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  try {
    const base = "https://volby.gov.cz/opendata/kv2026/csv_od";
    const resultUrl = `https://volby.gov.cz/appdata/kv2026/20261009/odata/zastup/vysledky_obec_${assembly}.xml`;
    const headers = { "User-Agent": "PrahaVoli/1.0 (public election data)" };
    const resultResponse = await fetch(resultUrl, { headers });
    if (!resultResponse.ok) throw new Error(`ČSÚ results HTTP ${resultResponse.status}`);
    const resultXml = await resultResponse.text();
    const assemblyAttrs = resultXml.match(/<OBEC\b([^>]*)>/)?.[1] || "";
    const completeValue = assemblyAttrs.match(/\bJE_SPOCTENO="([^"]+)"/)?.[1] || "";
    const electionComplete = ["true", "1"].includes(completeValue.toLowerCase());
    if (!electionComplete) return response.status(200).json({ available: false, lists: [] });

    const [candidateResponse, partyResponse] = await Promise.all([
      fetch(`${base}/kvrk.csv`, { headers }),
      fetch(`${base}/kvros.csv`, { headers }),
    ]);
    if (!candidateResponse.ok || !partyResponse.ok) throw new Error(`ČSÚ registry HTTP ${candidateResponse.status}/${partyResponse.status}`);
    const [candidateCsv, partyCsv] = await Promise.all([candidateResponse.text(), partyResponse.text()]);

    const parties = new Map();
    let partyColumns;
    parseCsv(partyCsv, (row) => {
      if (!partyColumns) { partyColumns = fieldIndexes(row); return; }
      if (value(row, partyColumns, "KODZASTUP") !== assembly) return;
      parties.set(value(row, partyColumns, "OSTRANA"), value(row, partyColumns, "NAZEVCELK"));
    }, assembly);

    const candidates = [];
    let candidateColumns;
    let hasResults = false;
    parseCsv(candidateCsv, (row) => {
      if (!candidateColumns) { candidateColumns = fieldIndexes(row); return; }
      if (value(row, candidateColumns, "KODZASTUP") !== assembly || value(row, candidateColumns, "PLATNOST") === "N") return;
      const votes = Number(value(row, candidateColumns, "POCHLASU")) || 0;
      const mandateValue = value(row, candidateColumns, "MANDAT").toUpperCase();
      const elected = electionComplete ? ["A", "1", "TRUE"].includes(mandateValue) : null;
      if (votes > 0 || elected === true) hasResults = true;
      const name = ["TITULPRED", "JMENO", "PRIJMENI", "TITULZA"].map((key) => value(row, candidateColumns, key).trim()).filter(Boolean).join(" ");
      if (!name) return;
      candidates.push({ name, party: parties.get(value(row, candidateColumns, "OSTRANA")) || "Kandidátní listina", votes, elected, ballotOrder: Number(value(row, candidateColumns, "PORCISLO")) || 0 });
    }, assembly);

    if (!hasResults) return response.status(200).json({ available: false, lists: [] });
    response.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    const grouped = new Map();
    for (const candidate of candidates) {
      if (!grouped.has(candidate.party)) grouped.set(candidate.party, []);
      grouped.get(candidate.party).push(candidate);
    }
    const lists = [...grouped].map(([name, entries]) => ({
      name,
      candidates: entries.sort((a, b) => b.votes - a.votes || a.ballotOrder - b.ballotOrder).slice(0, 10),
    })).sort((a, b) => a.name.localeCompare(b.name, "cs"));
    return response.status(200).json({ available: true, lists });
  } catch (error) {
    console.error("ČSÚ candidate registry fetch failed", { message: error?.message, cause: error?.cause?.message });
    return response.status(502).json({ error: "Nepodařilo se načíst hlasy kandidátů z ČSÚ." });
  }
};
