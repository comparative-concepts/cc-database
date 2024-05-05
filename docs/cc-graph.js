
var options = {
    edges: {
        width: 3,
        arrows: "to",
    },
    nodes: {
        shape: "box",
    },
    interaction: {
        hover: true,
    },
    physics: {
        solver: "forceAtlas2Based", // alternatives: "barnesHut", "repulsion"
        stabilization: {iterations: 100},
    }
};

var graphNames = {
    cxn: "Constructions",
    str: "Strategies",
    "str+cxn": "Cxn -> Str",
    sem: "Semantic CCs",
    inf: "Information packaging",
};

var graphRelations = {
    cxn: ["SubtypeOf", "ConstituentOf", "HeadOf"],
    str: ["SubtypeOf", "ConstituentOf"],
    "str+cxn": ["ExpressionOf", "ModeledOn", "RecruitedFrom"],
    sem: ["SubtypeOf", "ConstituentOf", "AttributeOf", "RoleOf", "FillerOf", "ValueOf"],
    inf: ["SubtypeOf", "ConstituentOf", "AttributeOf", "ValueOf"],
};

var colors = {
    0: "lightgreen",
    1: "gold",

    SubtypeOf: "limegreen", ExpressionOf: "limegreen",
    ConstituentOf: "orangered", ModeledOn: "orangered",
    HeadOf: "royalblue", RecruitedFrom: "royalblue", AttributeOf: "royalblue",
    RoleOf: "darkturquoise",
    FillerOf: "darkorange",
    ValueOf: "grey",
};

var ccNodes, ccEdges;
var network, gNodes, gEdges;

function init() {
    let select = document.getElementById("ccGraphType");
    let checkboxes = document.getElementById("ccRelations");
    for (let ccTypes in graphNames) {
        let ccName = graphNames[ccTypes];
        select.innerHTML += `<option value="${ccTypes}">${ccName}</option>`;
        let checked = true;
        for (let relId of graphRelations[ccTypes]) {
            if (!document.getElementById(relId)) {
                checkboxes.innerHTML += 
                    `<label style="color:${colors[relId]}; display:none">
                    <input type="checkbox" id="${relId}" onchange="selectGraph()" ${checked?"checked":""}/>
                    ${relId} &nbsp; </label>`;
            }
            checked = false;
        }
    }
    document.getElementById("statistics").innerHTML = `${ccNodes.length} CCs, ${ccEdges.length} edges.`;
    let container = document.getElementById("ccNetwork");
    network = new vis.Network(container, {nodes:[], edges:[]}, options);

    network.on("startStabilizing", function (params) {
        document.startTime = new Date().getTime();
        console.log("Stabilization started");
    });
    network.on("stabilizationProgress", function (params) {
        params.time = (new Date().getTime() - document.startTime) / 1000;
        console.log("Stabilization progress:", params);
    });
    network.on("stabilizationIterationsDone", function (params) {
        params = {};
        params.time = (new Date().getTime() - document.startTime) / 1000;
        console.log("Finished stabilization interations:", params);
    });
    network.on("stabilized", function (params) {
        params.time = (new Date().getTime() - document.startTime) / 1000;
        console.log("Stabilized!", params);
    });
}

function searchCC() {
    let search_term = document.getElementById("ccSearch").value;
    search_term = search_term.trim().replace(/\W+/g, ' ');
    if (search_term.length < 3) {
        network.unselectAll();
        return;
    }
    search_term = search_term.replaceAll(' ', '.*?');
    let regex = new RegExp(search_term, 'i');
    let selected = gNodes.filter((n) => regex.test(n.name) || regex.test(n.id)).map((n) => n.id);
    network.setSelection({nodes: selected});
}

function selectGraph() {
    let select = document.getElementById("ccGraphType");
    if (!select.value) return;
    let ccTypes = select.value.split("+");
    let relations = graphRelations[select.value];

    for (let lbl of document.getElementById("ccRelations").querySelectorAll("label")) {
        let show = relations.includes(lbl.querySelector("input").id);
        lbl.style.display = show ? "" : "none";
    }
    relations = relations.filter((rel) => document.getElementById(rel).checked);
    if (relations.length === 0) {
        let rel = graphRelations[select.value][0];
        document.getElementById(rel).checked = true;
        relations = [rel];
    }

    let showID = document.getElementById("ccShow").value === "id";
    gNodes = ccNodes.filter((n) => ccTypes.includes(n.type));
    gNodes = gNodes.map((n) => {
        let lbl = showID ? n.id.replaceAll("-", "-\n") : n.label.replaceAll(" ", "\n");
        let color = colors[ccTypes.indexOf(n.type)];
        return {id: n.id, name: n.label, label: lbl, type: n.type, color: {background: color, border: color}};
    });
    let nodeIds = gNodes.map((n) => n.id);
    gEdges = ccEdges.filter((e) => relations.includes(e.rel) && nodeIds.includes(e.from) && nodeIds.includes(e.to));
    gEdges = gEdges.map((e) => {
        let e2 = {from: e.from, to: e.to};
        e2.color = colors[e.rel];
        return e2;
    });
    let usedIds = {};
    for (let e of gEdges) usedIds[e.from] = usedIds[e.to] = true;
    let unusedNodes = gNodes.filter((n) => !usedIds[n.id]);
    gNodes = gNodes.filter((n) => usedIds[n.id]);
    console.log(`${select.options[select.selectedIndex].text}. Edges: ${gEdges.length}. Nodes: ${gNodes.length}. Unused: ${unusedNodes.length}.`);
    network.setData({nodes: gNodes, edges: gEdges});
    document.getElementById("ccSearch").value = "";

    document.getElementById("statistics").innerHTML = `${gNodes.length} CCs, ${gEdges.length} edges.`;
    unusedNodes.sort((a,b) => a.label.localeCompare(b.label));
    let unrelated = document.getElementById("ccUnrelated");
    unrelated.innerHTML = `<h3>${unusedNodes.length} unrelated CCs</h3>`;
    for (let cct of ccTypes) {
        let ulist = "";
        for (let n of unusedNodes) {
            if (n.type === cct) {
                ulist += `<li>${n.label.replaceAll("-\n", "-")}</li>`;
            }
        }
        unrelated.innerHTML += `<strong>${graphNames[cct]}</strong><ul>${ulist}</ul>`;
    }
}

