const ASSEMBLIES = {
  praha8: { name: "Praha 8", code: "500208", seats: 45 },
  magistrat: { name: "Magistrát hl. m. Prahy", code: "554782", seats: 65 },
};
const colors = ["#557f6d", "#c78658", "#7883ad", "#b76c72", "#aa9b4e", "#598f9a", "#9674a7", "#789458"];
let selected = "praha8";
let selectedYear = "2026";
let latestRequest = 0;

const el = (id) => document.getElementById(id);
const number = (value) => {
  const cleaned = String(value ?? "").replace(/\s/g, "").replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};
const textOf = (node, name) => {
  const key = name.toUpperCase();
  const nodes = [node, ...node.getElementsByTagName("*")];
  const ownAttribute = [...node.attributes].find((attribute) => attribute.name.toUpperCase() === key);
  if (ownAttribute) return ownAttribute.value.trim();
  for (const child of nodes.slice(1)) {
    if (child.tagName.toUpperCase() === key) return child.textContent.trim();
    const attribute = [...child.attributes].find((candidate) => candidate.name.toUpperCase() === key);
    if (attribute) return attribute.value.trim();
  }
  return "";
};
const descendants = (node, name) => [...node.getElementsByTagName("*")].filter((child) => child.tagName.toUpperCase() === name.toUpperCase());
const firstNumber = (node, names) => {
  for (const name of names) {
    const value = number(textOf(node, name));
    if (value !== null) return value;
  }
  return null;
};

function parseResults(xmlText, target) {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("ČSÚ vrátilo nečitelná data.");
  const all = [...doc.getElementsByTagName("*")];
  const root = doc.documentElement;
  const assembly = all.find((node) => node.tagName.toUpperCase() === "OBEC" && node.getAttribute("KODZASTUP") === target.code) || root;
  const precincts = firstNumber(assembly, ["OKRSKY_ZPRAC", "OKRSKYZPRAC", "OKRSKY_ZPRACOVANO"]);
  const totalPrecincts = firstNumber(assembly, ["OKRSKY_CELKEM", "OKRSKYCELK", "OKRSKY_CELK"]);
  const participation = firstNumber(assembly, ["UCAST_PROC", "UCASTPROC"]);
  const validVotes = firstNumber(assembly, ["PLATNE_HLASY", "PLATNEHLASY"]);
  const seatsConfirmed = ["1", "true"].includes((assembly.getAttribute("JE_SPOCTENO") || "").toLowerCase());
  const processedPct = firstNumber(assembly, ["OKRSKY_ZPRAC_PROC", "OKRSKYZPRACPROC"])
    ?? (precincts !== null && totalPrecincts ? (100 * precincts / totalPrecincts) : null);

  const partyNodes = descendants(assembly, "VOLEBNI_STRANA");
  const parties = partyNodes.map((node) => ({
    name: textOf(node, "NAZEV_STRANY") || textOf(node, "NAZEVPLNY") || textOf(node, "NAZEV"),
    votes: firstNumber(node, ["HLASY", "POCET_HLASU"]),
    pct: firstNumber(node, ["HLASY_PROC", "HLASYPROC"]),
    seats: seatsConfirmed ? firstNumber(node, ["ZASTUPITELE_POCET", "ZASTUPITELEPOCET", "POCET_ZASTUPITELU"]) : null,
  })).filter((party) => party.name).sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  const assignedSeats = parties.reduce((sum, party) => sum + (party.seats ?? 0), 0);
  return { precincts, totalPrecincts, processedPct, participation, validVotes, parties, assignedSeats, seatsConfirmed, generated: textOf(assembly, "DATUM_CAS_GENEROVANI") };
}

function fmt(value) { return value === null || value === undefined ? "—" : new Intl.NumberFormat("cs-CZ").format(value); }
function setNote(message, state = "") { const note = el("data-note"); note.className = `data-note ${state}`; note.lastElementChild.textContent = message; }

function render(data) {
  const config = ASSEMBLIES[selected];
  const historical = selectedYear === "2022";
  el("district-name").textContent = config.name;
  el("result-mode").textContent = historical ? "KONEČNÝ STAV" : "PRŮBĚŽNÝ STAV";
  el("ranking-mode").textContent = historical ? "KONEČNÉ POŘADÍ" : "PRŮBĚŽNÉ POŘADÍ";
  el("results-foot-copy").textContent = historical
    ? "Konečné počty hlasů a mandátů podle oficiálních výsledků ČSÚ za volby v roce 2022."
    : "Mandáty zobrazujeme, jakmile je ČSÚ oficiálně přidělí. Během sčítání mohou být výsledky neúplné.";
  el("precinct-pct").textContent = data.processedPct === null ? "—" : data.processedPct.toLocaleString("cs-CZ", { maximumFractionDigits: 1 });
  el("progress-fill").style.width = `${Math.min(100, Math.max(0, data.processedPct ?? 0))}%`;
  el("precinct-count").textContent = data.precincts === null ? "Čeká se na první data" : `${fmt(data.precincts)} / ${fmt(data.totalPrecincts ?? "—")}`;
  el("valid-votes").textContent = fmt(data.validVotes);
  el("turnout").textContent = data.participation === null ? "Účast se dopočítává" : `Volební účast ${data.participation.toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} %`;
  el("seats-filled").textContent = data.seatsConfirmed ? fmt(data.assignedSeats) : "—";
  el("seat-total").textContent = config.seats;
  el("seats-note").textContent = data.seatsConfirmed ? "Potvrzené mandáty ČSÚ" : "ČSÚ zatím mandáty nepřidělil";
  const list = el("party-list");
  if (!data.parties.length || !data.precincts) {
    list.innerHTML = `<div class="empty-state"><div class="empty-symbol">✳</div><b>${selectedYear === "2022" ? "Historická data nejsou dostupná" : data.parties.length ? "Sčítání zatím nezačalo" : "Čekáme na první sečtené okrsky"}</b><span>Výsledky se načítají přímo z dat ČSÚ.</span></div>`;
    return;
  }
  list.innerHTML = data.parties.map((party, index) => `<article class="party-row" style="--party-color:${colors[index % colors.length]}">
    <div class="party-name"><i class="party-color"></i><div><strong>${escapeHtml(party.name)}</strong><small>${index + 1}. místo</small></div></div>
    <div class="party-score"><strong>${fmt(party.votes)}</strong><span>${party.pct === null ? "—" : `${party.pct.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })} %`}</span></div>
    <div class="party-seats">${party.seats === null ? "—" : fmt(party.seats)}<small>mandátů</small></div>
  </article>`).join("");
}
function escapeHtml(value) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])); }

async function refresh() {
  const requestId = ++latestRequest;
  const config = ASSEMBLIES[selected];
  const year = selectedYear;
  try {
    const response = await fetch(`/api/results?assembly=${config.code}&year=${year}`, { cache: "no-store" });
    const body = await response.text();
    if (!response.ok) throw new Error(body || "Zdroj výsledků není dostupný.");
    if (requestId !== latestRequest) return;
    const data = parseResults(body, config);
    render(data);
    el("updated-at").textContent = `${year === "2022" ? "Načteno" : "Kontrola"} ${new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit"})}`;
    setNote(year === "2022"
      ? "Konečné výsledky komunálních voleb 2022 · ověřovací data ČSÚ"
      : "Kontrola probíhá každých 15 sekund · oficiální data ČSÚ se mohou aktualizovat pomaleji", "ok");
  } catch (error) {
    if (requestId !== latestRequest) return;
    setNote(year === "2022" ? `${error.message} Zkuste data načíst znovu.` : `${error.message} Další pokus za 15 sekund.`, "error");
    el("updated-at").textContent = "Zdroj nedostupný";
  }
}

function resetForLoading() {
  el("precinct-pct").textContent = "—";
  el("progress-fill").style.width = "0%";
  el("precinct-count").textContent = "Načítám…";
  el("valid-votes").textContent = "—";
  el("turnout").textContent = "Načítám…";
  el("seats-filled").textContent = "—";
  el("party-list").innerHTML = `<div class="empty-state"><div class="empty-symbol">✳</div><b>Načítám výsledky</b><span>Ověřuji aktuální stav u ČSÚ.</span></div>`;
  el("updated-at").textContent = "Načítám…";
}

document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => {
  selected = button.dataset.district;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  el("district-name").textContent = ASSEMBLIES[selected].name;
  el("seat-total").textContent = ASSEMBLIES[selected].seats;
  resetForLoading();
  refresh();
}));

document.querySelectorAll(".year-tab").forEach((button) => button.addEventListener("click", () => {
  selectedYear = button.dataset.year;
  document.querySelectorAll(".year-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  const historical = selectedYear === "2022";
  el("hero-year").textContent = selectedYear;
  el("hero-copy").textContent = historical
    ? "Konečné výsledky posledních komunálních voleb pro Prahu 8 a pražský magistrát."
    : "Průběžné sčítání pro Prahu 8 a pražský magistrát.";
  el("status-label").textContent = historical ? "ARCHIVNÍ DATA 2022" : "ŽIVÉ VÝSLEDKY";
  el("status-indicator").classList.toggle("archived", historical);
  el("official-source").href = historical
    ? "https://volby.gov.cz/opendata/kv2022/kv2022_opendata.htm"
    : "https://volby.gov.cz/opendata/kv2026/kv2026_opendata.htm";
  el("result-mode").textContent = historical ? "KONEČNÝ STAV" : "PRŮBĚŽNÝ STAV";
  el("ranking-mode").textContent = historical ? "KONEČNÉ POŘADÍ" : "PRŮBĚŽNÉ POŘADÍ";
  el("seats-note").textContent = historical ? "Oficiálně přidělené mandáty" : "Potvrzené výsledky ČSÚ";
  resetForLoading();
  refresh();
}));
refresh();
setInterval(() => { if (selectedYear === "2026") refresh(); }, 15_000);
