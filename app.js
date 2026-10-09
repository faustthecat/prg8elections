const ASSEMBLIES = {
  praha8: { name: "Praha 8", code: "500208", seats: 45 },
  magistrat: { name: "Magistrát hl. m. Prahy", code: "554782", seats: 65 },
};
const colors = ["#557f6d", "#c78658", "#7883ad", "#b76c72", "#aa9b4e", "#598f9a", "#9674a7", "#789458"];
let selected = "praha8";
let refreshing = false;

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
  const seatsConfirmed = assembly.getAttribute("JE_SPOCTENO") === "1";
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
  el("district-name").textContent = config.name;
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
    list.innerHTML = `<div class="empty-state"><div class="empty-symbol">✳</div><b>${data.parties.length ? "Sčítání zatím nezačalo" : "Čekáme na první sečtené okrsky"}</b><span>Výsledky se načítají přímo z dat ČSÚ.</span></div>`;
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
  if (refreshing) return;
  refreshing = true;
  const config = ASSEMBLIES[selected];
  try {
    const response = await fetch(`/api/results?assembly=${config.code}`, { cache: "no-store" });
    const body = await response.text();
    if (!response.ok) throw new Error(body || "Zdroj výsledků není dostupný.");
    const data = parseResults(body, config);
    render(data);
    el("updated-at").textContent = new Date().toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setNote("Kontrola probíhá každých 15 sekund · oficiální data ČSÚ se mohou aktualizovat pomaleji", "ok");
  } catch (error) {
    setNote(`${error.message} Další pokus za 15 sekund.`, "error");
    el("updated-at").textContent = "Zdroj nedostupný";
  } finally { refreshing = false; }
}

document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => {
  selected = button.dataset.district;
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  el("district-name").textContent = ASSEMBLIES[selected].name;
  el("seat-total").textContent = ASSEMBLIES[selected].seats;
  el("updated-at").textContent = "Načítám…";
  el("party-list").innerHTML = `<div class="empty-state"><div class="empty-symbol">✳</div><b>Načítám výsledky</b><span>Ověřuji aktuální stav u ČSÚ.</span></div>`;
  refresh();
}));
refresh();
setInterval(refresh, 15_000);
