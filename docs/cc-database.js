
window.name = "CC-database";
window.addEventListener("DOMContentLoaded", initialize);

DATA.types = {
    cxn: "cxn:construction",
    inf: "inf:information-packaging",
    str: "str:strategy",
    sem: "sem:meaning",
    def: "definition",
};

function initialize() {
    const startTime = new Date().getTime();
    build_table();
    init_linktitles();
    init_searchfilter();
    const elapsedTime = new Date().getTime() - startTime;
    console.log(`Finished initialization in ${elapsedTime/1000} s`);
}


function build_table() {
    document.getElementById("db-version").innerText = DATA.version;
    document.getElementById("db-build-date").innerText = DATA.builddate;
    document.getElementById("db-statistics").innerText =
        `${DATA.nodes.length} CCs, with ${DATA.edges.length} typed relations`;

    DATA.concepts = {};
    for (const cc of DATA.nodes) {
        cc.related = [];
        DATA.concepts[cc.id] = cc;
    }
    DATA.relations = {};
    for (const e of DATA.edges) {
        DATA.concepts[e.start].related.push(e.end);
        DATA.concepts[e.end].related.push(e.start);
        if (!(e.rel in DATA.relations)) DATA.relations[e.rel] = {start: {}, end: {}};
        (DATA.relations[e.rel].start[e.start] ??= []).push(e.end);
        (DATA.relations[e.rel].end[e.end] ??= []).push(e.start);
    }

    const template = document.getElementById("cc-entry-template");
    DATA.nodes.sort((a,b) => Intl.Collator().compare(a.name,b.name));
    for (const cc of DATA.nodes) {
        const elem = build_cc_item(cc, template);
        document.getElementById("glosses").appendChild(elem);
        cc.elem = elem;
    }
}


function build_cc_item(cc, template) {
    const clone = template.content.cloneNode(true).querySelector(".cc");
    clone.setAttribute('id', cc.id);
    let elem;
    elem = clone.querySelector(".cc-header-name");
    elem.innerHTML = `${cc.name} (<em>${cc.type}</em>)`;
    elem.setAttribute('href', "#" + cc.id);
    elem = clone.querySelector(".cc-header-graph");
    elem.setAttribute('href', `cc-graph.html#g=${cc.type}&id=${cc.id}`);
    for (const row of clone.querySelectorAll(".cc-information > div")) {
        elem = row.querySelector(".cc-info");
        switch (row.getAttribute('type')) {
        case "cc-id":
            elem.innerText = cc.id;
            break;
        case "cc-type":
            const typeID = DATA.types[cc.type];
            elem.innerHTML = DATA.concepts[typeID] ? `<a href="#${typeID}">${DATA.concepts[typeID].name}</a>` : typeID;
            break;
        case "cc-alias":
            if (!cc.alias) {
                row.remove();
                break;
            }
            elem.innerHTML = cc.alias.join(" <br/>");
            break;
        case "cc-definition":
            if (!cc.definition) {
                row.remove();
                break;
            }
            elem.innerHTML = cc.definition;
            break;
        case "cc-not-original":
            if (!cc.notOriginal) row.remove();
            break;
        case "cc-relation":
            const relations = row.getAttribute('relation').trim().split(/ +/);
            const direction = row.getAttribute('direction');
            const targets = (
                direction === "out"
                ? relations.flatMap((r) => DATA.relations[r]?.end[cc.id] || [])
                : relations.flatMap((r) => DATA.relations[r]?.start[cc.id] || [])
            );
            if (targets.length === 0) {
                row.remove();
                break;
            }
            elem.innerHTML = targets.map(ccLink).join("<br/>");
            break;
        case "cc-hierarchy":
            const hrelations = row.getAttribute('relation').trim().split(/ +/);
            const parents = hrelations.flatMap((r) => DATA.relations[r]?.end[cc.id] || []);
            const children = hrelations.flatMap((r) => DATA.relations[r]?.start[cc.id] || []);
            if (parents.length === 0 && children.length === 0) {
                row.remove();
                break;
            }
            if (parents.length) {
                elem.innerHTML += `<div class="boxes">` + parents.map(ccLink).join("") + `</div>`;
            }
            elem.innerHTML += `<div><strong>${ccName(cc.id)}</strong></div>`;
            if (children.length) {
                elem.innerHTML += `<div class="boxes">` + children.map(ccLink).join("") + `</div>`;
            }
            break;
        }
    }
    return clone;
}

function ccLink(id) {
    return `<span><a href="#${id}">${ccName(id)}</a></span>`;
}

function ccName(id) {
    const cc = DATA.concepts[id];
    return `${cc.name} (<em>${cc.type}</em>)`;
}

function stripHTML(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || "";
}


///////////////////////////////////////////////////////////////////////////////
// Show preview when hovering over links

function init_linktitles() {
    for (const elem of document.getElementsByTagName('a')) {
        elem.addEventListener('mouseover', set_link_title);
    }
}

function set_link_title(event) {
    if (typeof event.target.href !== "string") return;
    const url = new URL(event.target.href);
    const id = url.hash.replace("#", "");
    const cc = DATA.concepts[id];
    if (cc) {
        event.target.title = cc.name.toUpperCase() + "\n" + stripHTML(cc.definition || "[no definition]");
    }
}


///////////////////////////////////////////////////////////////////////////////
// Searching/filtering CCs

function init_searchfilter() {
    for (const id in DATA.concepts) {
        const cc = DATA.concepts[id];
        cc.search = {
            name: (cc.alias || []).concat(cc.name).join("\n"),
            definition: stripHTML(cc.definition),
            relation: cc.related.map((c) => DATA.concepts[c].name).join("\n"),
        };
    }
    for (const elem of document.querySelectorAll('a')) {
        elem.addEventListener('click', () => setTimeout(filter_ccs, 100));
    }
    for (const elem of document.querySelectorAll('#search input')) {
        elem.addEventListener('input', filter_ccs);
    }
    document.getElementById("search").addEventListener("toggle", filter_ccs);
    window.addEventListener("hashchange", filter_ccs);
    filter_ccs();
}


function filter_ccs() {
    const glosses = document.getElementById("glosses");
    new Mark(glosses).unmark();

    const current_id = window.location.hash.replace("#", "");
    const current_elem = current_id && document.getElementById(current_id);
    if (current_elem) {
        const current_name = current_elem.querySelector(".cc-header-name");
        new Mark(current_name).markRanges([{
            start: 0, length: current_name.innerText.trim().length,
        }]);
    }

    // Define search variables, based on current search term
    // We only care about alphanumeric characters
    let search_term = document.getElementById("search-box").value.trim().replace(/\W+/g, " ");
    const is_search = (
        document.getElementById("search").hasAttribute("open") &&
        search_term.length >= 3
    );
    if (!is_search) {
        document.querySelectorAll(".cc").forEach((elem) => {elem.style.display = ""});
        document.getElementById("search-info").innerText = `Type at least 3 characters`;
        return;
    }

    const match_type = document.querySelector('#search input[name="matchtype"]:checked')?.value;
    if (match_type === "startswith") {
        search_term = "^" + search_term.replaceAll(" ", "\\S*?\\s*");
    } else if (match_type === "wordstarts") {
        search_term = "\\b" + search_term.replaceAll(" ", ".*?\\b");
    } else {
        search_term = search_term.replaceAll(" ", ".*?");
    }
    const regex = new RegExp(search_term, "igm");
    const mark_regex = new RegExp(search_term.replace("^", "\\b"), "igm");

    const filter_types = [...document.querySelectorAll('#search input[name="filtertype"]:checked')].map((e) => e.value);
    const cc_types = new Set([...document.querySelectorAll('#search input[name="cctype"]:checked')].map((e) => e.value));

    let count = 0;
    for (const id in DATA.concepts) {
        const cc = DATA.concepts[id];
        const show = (
            cc_types.has(cc.type) &&
            filter_types.some((type) => regex.test(cc.search[type]))
        );
        if (id === current_id || show) {
            cc.elem.style.display = "";
            count++;
            for (const type of filter_types) {
                const contents = cc.elem.querySelectorAll("." + type);
                new Mark(contents).markRegExp(mark_regex, {acrossElements: true});
            }
        } else {
            cc.elem.style.display = "none";
        }
    }

    document.getElementById("search-info").innerText = `Showing ${count} CCs (out of ${DATA.nodes.length})`;
    document.getElementById("search-box").focus();
    if (current_elem) current_elem.scrollIntoView();
}
