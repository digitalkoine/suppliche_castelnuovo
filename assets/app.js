/* DB Suppliche – sito statico con query in-browser (sql.js) */
let SQL = null;
let db = null;

const TYPE_COLS = ["cancellazione_pena", "totalita_pena", "permuta_pena", "proroga_pena", "composizione_pena", "richiesta_generale", "richiesta_di_llicenza", "rottura_carcere", "pena_capitale"];
const OUTCOME_COLS = ["grazia_concessa_totalmente", "grazia_concessa_parzialmente", "grazia_respinta", "nessuna_risposta"];

const el = (id) => document.getElementById(id);

function setStatus(html) {
  el("status").innerHTML = html;
}

function escLike(s) {
  // escape % and _ for LIKE; use ESCAPE '\\'
  return s.replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function likeParam(s) {
  return "%" + escLike(s) + "%";
}

function getSelectedTypes() {
  const nodes = el("types").querySelectorAll("input[type=checkbox]");
  const out = [];
  nodes.forEach(n => { if (n.checked) out.push(n.value); });
  return out.filter(v => TYPE_COLS.includes(v));
}

function resetForm() {
  el("q").value = "";
  el("outcome").value = "";
  el("genere").value = "";
  el("professione").value = "";
  el("luogo").value = "";
  el("anno_da").value = "";
  el("anno_a").value = "";
  el("type_mode").value = "any";
  el("page_size").value = "30";
  el("types").querySelectorAll("input[type=checkbox]").forEach(n => n.checked = false);
}

function getFilters() {
  return {
    view: el("view").value, // petitions|people
    q: el("q").value.trim(),
    outcome: el("outcome").value,
    genere: el("genere").value,
    professione: el("professione").value.trim(),
    luogo: el("luogo").value.trim(),
    anno_da: el("anno_da").value.trim(),
    anno_a: el("anno_a").value.trim(),
    type_mode: el("type_mode").value,
    types: getSelectedTypes(),
    page_size: parseInt(el("page_size").value || "30", 10),
  };
}

function buildWhere(flt) {
  const where = [];
  const params = [];

  // person filters
  if (flt.genere) {
    where.push("p.genere = ?");
    params.push(flt.genere);
  }
  if (flt.professione) {
    where.push("p.professione_ruolo_supplicante LIKE ? ESCAPE '\\'");
    params.push(likeParam(flt.professione));
  }
  if (flt.luogo) {
    where.push("p.luogo_di_provenienza_supplicante LIKE ? ESCAPE '\\'");
    params.push(likeParam(flt.luogo));
  }

  // petition filters: types
  if (flt.types && flt.types.length) {
    if (flt.type_mode === "all") {
      flt.types.forEach(col => where.push(`s.${col} IS NOT NULL`));
    } else {
      where.push("(" + flt.types.map(col => `s.${col} IS NOT NULL`).join(" OR ") + ")");
    }
  }

  // outcome
  if (flt.outcome && OUTCOME_COLS.includes(flt.outcome)) {
    where.push(`s.${flt.outcome} IS NOT NULL`);
  }

  // year range (based on risposta SM then SF)
  if (flt.anno_da) {
    where.push("substr(COALESCE(s.data_risposta_sm, s.data_risposta_sf),1,4) >= ?");
    params.push(flt.anno_da);
  }
  if (flt.anno_a) {
    where.push("substr(COALESCE(s.data_risposta_sm, s.data_risposta_sf),1,4) <= ?");
    params.push(flt.anno_a);
  }

  // free text across key fields
  if (flt.q) {
    where.push("(" + [
      "p.nome_supplicante LIKE ? ESCAPE '\\'",
      "p.cognome_supplicanti LIKE ? ESCAPE '\\'",
      "p.descritto LIKE ? ESCAPE '\\'",
      "p.professione_ruolo_supplicante LIKE ? ESCAPE '\\'",
      "s.motivazione LIKE ? ESCAPE '\\'",
      "s.richiesta LIKE ? ESCAPE '\\'",
      "s.caratteristiche_della_richiesta LIKE ? ESCAPE '\\'",
    ].join(" OR ") + ")");
    const q = likeParam(flt.q);
    for (let i=0;i<7;i++) params.push(q);
  }

  return { whereSql: where.length ? ("WHERE " + where.join(" AND ")) : "", params };
}

function runQuery(sql, params) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function runScalar(sql, params) {
  const rows = runQuery(sql, params);
  if (!rows.length) return 0;
  const k = Object.keys(rows[0])[0];
  return rows[0][k] ?? 0;
}

function badge(text, cls="") {
  return `<span class="badge ${cls}">${text}</span>`;
}

function openModal(title, metaHtml, bodyHtml) {
  el("modalTitle").textContent = title;
  el("modalMeta").innerHTML = metaHtml || "";
  el("modalBody").innerHTML = bodyHtml || "";
  el("modalBackdrop").style.display = "flex";
  el("modalBackdrop").setAttribute("aria-hidden", "false");
}

function closeModal() {
  el("modalBackdrop").style.display = "none";
  el("modalBackdrop").setAttribute("aria-hidden", "true");
  el("modalBody").innerHTML = "";
}

function kvTable(obj) {
  const rows = Object.entries(obj)
    .filter(([k,v]) => v !== null && v !== "" && v !== undefined)
    .map(([k,v]) => `
      <div class="kv-row">
        <div class="kv-k">${k}</div>
        <div class="kv-v">${String(v)}</div>
      </div>
    `).join("");
  return `<div class="kv">${rows || `<p class="muted">Nessun dato.</p>`}</div>`;
}

function listToHtml(items) {
  return `<div class="list">${items.join("")}</div>`;
}

async function showPetition(pid) {
  const sRows = runQuery("SELECT * FROM suppliche_clean WHERE codice_id_supplica = ? LIMIT 1", [pid]);
  if (!sRows.length) return;
  const s = sRows[0];

  const people = runQuery(`
    SELECT p.* FROM supplicanti_clean p
    JOIN suppliche_supplicanti_clean ss ON ss.codice_id_supplicante = p.codice_id_supplicante
    WHERE ss.codice_id_supplica = ?
    ORDER BY p.cognome_supplicanti, p.nome_supplicante
  `, [pid]);

  const dates = runQuery(`
    SELECT * FROM suppliche_date_clean
    WHERE supplica_id = ?
    ORDER BY campo
  `, [pid]);

  const dr = s.data_risposta_sm || s.data_risposta_sf || "";
  let meta = dr ? badge("Risposta " + dr) : "";
  if (s.grazia_concessa_totalmente !== null) meta += badge("Concessa (totale)","ok");
  if (s.grazia_concessa_parzialmente !== null) meta += badge("Concessa (parziale)","ok");
  if (s.grazia_respinta !== null) meta += badge("Respinta","bad");
  if (s.nessuna_risposta !== null) meta += badge("Nessuna risposta","warn");

  const peopleHtml = listToHtml(people.map(p => `
    <div class="item" onclick="showPerson('${p.codice_id_supplicante}')">
      <div class="item-title">${(p.cognome_supplicanti||"")} ${(p.nome_supplicante||"")}</div>
      <div class="item-meta">
        ${badge("ID " + p.codice_id_supplicante)}
        ${p.genere ? badge("Genere " + p.genere) : ""}
        ${p.professione_ruolo_supplicante ? badge(p.professione_ruolo_supplicante) : ""}
      </div>
    </div>
  `));

  const datesHtml = (dates.length)
    ? `<div class="tablewrap"><table>
        <thead><tr><th>Campo</th><th>Inizio</th><th>Fine</th><th>Precisione</th><th>Valore grezzo</th></tr></thead>
        <tbody>
          ${dates.map(d => `
            <tr>
              <td>${d.campo||""}</td>
              <td>${d.data_inizio||""}</td>
              <td>${d.data_fine||""}</td>
              <td>${d.precisione||""}</td>
              <td>${d.valore_grezzo||""}</td>
            </tr>`).join("")}
        </tbody></table></div>`
    : `<p class="muted">Nessuna data normalizzata.</p>`;

  const body = `
    <section class="card">
      <h2>Supplicanti</h2>
      ${peopleHtml}
    </section>
    <section class="card">
      <h2>Date normalizzate</h2>
      ${datesHtml}
    </section>
    <section class="card">
      <h2>Dati completi</h2>
      ${kvTable(s)}
    </section>
  `;

  openModal("Supplica ID " + pid, meta, body);
}

async function showPerson(sid) {
  const pRows = runQuery("SELECT * FROM supplicanti_clean WHERE codice_id_supplicante = ? LIMIT 1", [sid]);
  if (!pRows.length) return;
  const p = pRows[0];

  const suppliche = runQuery(`
    SELECT s.*,
           GROUP_CONCAT(DISTINCT (p2.cognome_supplicanti || ' ' || p2.nome_supplicante), ' | ') AS supplicanti_nomi
    FROM suppliche_clean s
    JOIN suppliche_supplicanti_clean ss ON ss.codice_id_supplica = s.codice_id_supplica
    JOIN supplicanti_clean p2 ON p2.codice_id_supplicante = ss.codice_id_supplicante
    WHERE s.codice_id_supplica IN (
      SELECT codice_id_supplica FROM suppliche_supplicanti_clean WHERE codice_id_supplicante = ?
    )
    GROUP BY s.codice_id_supplica
    ORDER BY COALESCE(s.data_risposta_sm, s.data_risposta_sf) DESC, s.codice_id_supplica DESC
  `, [sid]);

  let meta = badge("ID " + sid);
  if (p.genere) meta += badge("Genere " + p.genere);
  if (p.eta) meta += badge("Età " + p.eta);

  const supplicheHtml = listToHtml(suppliche.map(s => {
    const dr = s.data_risposta_sm || s.data_risposta_sf || "";
    let m = dr ? badge("Risposta " + dr) : "";
    if (s.grazia_concessa_totalmente !== null) m += badge("Concessa (totale)","ok");
    if (s.grazia_concessa_parzialmente !== null) m += badge("Concessa (parziale)","ok");
    if (s.grazia_respinta !== null) m += badge("Respinta","bad");
    if (s.nessuna_risposta !== null) m += badge("Nessuna risposta","warn");
    if (s.supplicanti_nomi) m += badge(s.supplicanti_nomi);
    return `
      <div class="item" onclick="showPetition('${s.codice_id_supplica}')">
        <div class="item-title">Supplica ID ${s.codice_id_supplica}</div>
        <div class="item-meta">${m}</div>
      </div>
    `;
  }));

  const body = `
    <section class="card">
      <h2>Dati persona</h2>
      ${kvTable(p)}
    </section>
    <section class="card">
      <h2>Suppliche collegate (${suppliche.length})</h2>
      ${supplicheHtml}
    </section>
  `;
  openModal(((p.cognome_supplicanti||"") + " " + (p.nome_supplicante||"")).trim() || ("Supplicante " + sid), meta, body);
}

function renderResultsPetitions(rows) {
  const items = rows.map(r => {
    const dr = r.data_risposta_sm || r.data_risposta_sf || "";
    let m = dr ? badge("Risposta " + dr) : "";
    if (r.grazia_concessa_totalmente !== null) m += badge("Concessa (totale)","ok");
    if (r.grazia_concessa_parzialmente !== null) m += badge("Concessa (parziale)","ok");
    if (r.grazia_respinta !== null) m += badge("Respinta","bad");
    if (r.nessuna_risposta !== null) m += badge("Nessuna risposta","warn");
    if (r.supplicanti_nomi) m += badge(r.supplicanti_nomi);

    return `
      <div class="item" onclick="showPetition('${r.codice_id_supplica}')">
        <div class="item-title">Supplica ID ${r.codice_id_supplica}</div>
        <div class="item-meta">${m}</div>
      </div>
    `;
  });
  el("results").innerHTML = items.join("") || `<p class="muted">Nessun risultato.</p>`;
}

function renderResultsPeople(rows) {
  const items = rows.map(r => {
    let m = badge("ID " + r.codice_id_supplicante);
    if (r.genere) m += badge("Genere " + r.genere);
    if (r.professione_ruolo_supplicante) m += badge(r.professione_ruolo_supplicante);
    m += badge((r.n_suppliche||0) + " suppliche");
    return `
      <div class="item" onclick="showPerson('${r.codice_id_supplicante}')">
        <div class="item-title">${(r.cognome_supplicanti||"")} ${(r.nome_supplicante||"")}</div>
        <div class="item-meta">${m}</div>
      </div>
    `;
  });
  el("results").innerHTML = items.join("") || `<p class="muted">Nessun risultato.</p>`;
}

function renderPager(total, page, pages, onPage) {
  const parts = [];
  const mk = (p, label, ghost=true) => `<button class="btn ${ghost?'ghost':''}" type="button" data-page="${p}">${label}</button>`;
  if (page > 1) parts.push(mk(page-1, "← Precedente"));
  if (page < pages) parts.push(mk(page+1, "Successiva →"));
  el("pager").innerHTML = parts.join("");
  el("pager").querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => onPage(parseInt(b.dataset.page,10)));
  });
}

function doSearch(page=1) {
  const flt = getFilters();
  const pageSize = flt.page_size || 30;

  const {whereSql, params} = buildWhere(flt);

  // Count + results query
  let total = 0;
  let rows = [];
  if (flt.view === "people") {
    total = runScalar(`
      SELECT COUNT(DISTINCT p.codice_id_supplicante) AS n
      FROM supplicanti_clean p
      LEFT JOIN suppliche_supplicanti_clean ss ON ss.codice_id_supplicante = p.codice_id_supplicante
      LEFT JOIN suppliche_clean s ON s.codice_id_supplica = ss.codice_id_supplica
      ${whereSql}
    `, params);

    const pages = Math.max(1, Math.ceil(total / pageSize));
    const pg = Math.max(1, Math.min(page, pages));
    const offset = (pg - 1) * pageSize;

    rows = runQuery(`
      SELECT p.*,
             COUNT(DISTINCT ss.codice_id_supplica) AS n_suppliche
      FROM supplicanti_clean p
      LEFT JOIN suppliche_supplicanti_clean ss ON ss.codice_id_supplicante = p.codice_id_supplicante
      LEFT JOIN suppliche_clean s ON s.codice_id_supplica = ss.codice_id_supplica
      ${whereSql}
      GROUP BY p.codice_id_supplicante
      ORDER BY p.cognome_supplicanti, p.nome_supplicante
      LIMIT ? OFFSET ?
    `, params.concat([pageSize, offset]));

    el("resultsCard").style.display = "block";
    el("resultsMeta").textContent = `${total} risultati · pagina ${pg} / ${pages}`;
    renderResultsPeople(rows);
    renderPager(total, pg, pages, (p)=>doSearch(p));
    return;
  }

  // petitions
  total = runScalar(`
    SELECT COUNT(DISTINCT s.codice_id_supplica) AS n
    FROM suppliche_clean s
    LEFT JOIN suppliche_supplicanti_clean ss ON ss.codice_id_supplica = s.codice_id_supplica
    LEFT JOIN supplicanti_clean p ON p.codice_id_supplicante = ss.codice_id_supplicante
    ${whereSql}
  `, params);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pg = Math.max(1, Math.min(page, pages));
  const offset = (pg - 1) * pageSize;

  rows = runQuery(`
    SELECT s.*,
           GROUP_CONCAT(DISTINCT p.codice_id_supplicante) AS supplicanti_ids,
           GROUP_CONCAT(DISTINCT (p.cognome_supplicanti || ' ' || p.nome_supplicante), ' | ') AS supplicanti_nomi
    FROM suppliche_clean s
    LEFT JOIN suppliche_supplicanti_clean ss ON ss.codice_id_supplica = s.codice_id_supplica
    LEFT JOIN supplicanti_clean p ON p.codice_id_supplicante = ss.codice_id_supplicante
    ${whereSql}
    GROUP BY s.codice_id_supplica
    ORDER BY COALESCE(s.data_risposta_sm, s.data_risposta_sf) DESC, s.codice_id_supplica DESC
    LIMIT ? OFFSET ?
  `, params.concat([pageSize, offset]));

  el("resultsCard").style.display = "block";
  el("resultsMeta").textContent = `${total} risultati · pagina ${pg} / ${pages}`;
  renderResultsPetitions(rows);
  renderPager(total, pg, pages, (p)=>doSearch(p));
}

async function init() {
  try {
    // Init sql.js
    SQL = await initSqlJs({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${file}`
    });
    const resp = await fetch("data/suppliche.sqlite");
    if (!resp.ok) throw new Error("Impossibile caricare data/suppliche.sqlite (" + resp.status + ")");
    const buf = await resp.arrayBuffer();
    db = new SQL.Database(new Uint8Array(buf));

    setStatus("Database caricato. Premi <b>Cerca</b> oppure inserisci filtri e cerca.");
    el("do_search").disabled = false;

    // wiring
    el("do_search").addEventListener("click", ()=>doSearch(1));
    el("reset").addEventListener("click", ()=>{ resetForm(); el("resultsCard").style.display="none"; });
    el("clear_types").addEventListener("click", ()=>{ el("types").querySelectorAll("input[type=checkbox]").forEach(n => n.checked = false); });

    el("tab_petitions").addEventListener("click", ()=>setView("petitions"));
    el("tab_people").addEventListener("click", ()=>setView("people"));

    // modal
    el("modalClose").addEventListener("click", closeModal);
    el("modalBackdrop").addEventListener("click", (e)=>{ if (e.target === el("modalBackdrop")) closeModal(); });
    window.showPetition = showPetition;
    window.showPerson = showPerson;

    // default first query
    doSearch(1);
  } catch (err) {
    console.error(err);
    setStatus(`<b>Errore:</b> ${String(err)}<br><br>
      Se stai aprendo il file con doppio click (file://), alcune funzioni potrebbero essere bloccate.
      Pubblica la cartella su un host (GitHub Pages) oppure avvia un server locale (es. <span class="code">python -m http.server</span>).`);
  }
}

function setView(view) {
  el("view").value = view;
  el("tab_petitions").classList.toggle("active", view === "petitions");
  el("tab_people").classList.toggle("active", view === "people");
  el("resultsCard").style.display = "none";
}

init();
