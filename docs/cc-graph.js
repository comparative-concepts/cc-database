
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
        stabilization: {iterations: 500},
    }
};

var graphtypes = [
    ["cxn", "SubtypeOf", "ConstituentOf+HeadOf", "SubtypeOf+ConstituentOf+HeadOf"],
    ["str", "SubtypeOf", "ConstituentOf", "SubtypeOf+ConstituentOf"],
    ["str+cxn", "ExpressionOf+ModeledOn+RecruitedFrom"],
    ["sem", "SubtypeOf", "ConstituentOf", "SubtypeOf+ConstituentOf", "AttributeOf+ValueOf+RoleOf+FillerOf"],
    ["inf", "SubtypeOf", "ConstituentOf", "SubtypeOf+ConstituentOf", "AttributeOf+ValueOf"],
];

var colors = {
    cxn: "gold",
    str: "lightgreen",
    sem: "violet",
    inf: "lightsalmon",
    def: "lightgrey",

    // 0: use default = from node
    1: "blue",
    2: "red",
    3: "lime",
};

var ccNodes, ccEdges;
var network, gNodes, gEdges;

function init() {
    let select = document.getElementById("ccGraphType");
    for (let gtypes of graphtypes) {
        select.innerHTML += `<hr/>`;
        let cctypes = gtypes.shift();
        for (let rels of gtypes) {
            let val = rels + "-" + cctypes;
            let lbl = cctypes.toUpperCase().replaceAll("+", " &rarr; ") + ": " + rels.replaceAll("+", " + ");
            select.innerHTML += `<option value="${val}">${lbl}</option>`;
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
    let [rel, cct] = select.value.split("-");
    let relations = rel.split("+");
    let cctypes = cct.split("+");

    let showID = document.getElementById("ccShow").value === "id";
    gNodes = ccNodes.filter((n) => cctypes.includes(n.type));
    gNodes = gNodes.map((n) => {
        let lbl = showID ? n.id.replaceAll("-", "-\n") : n.label.replaceAll(" ", "\n");
        let color = colors[n.type];
        return {id: n.id, name: n.label, label: lbl, type: n.type, color: {background: color, border: color}};
    });
    let nodeIds = gNodes.map((n) => n.id);
    gEdges = ccEdges.filter((e) => relations.includes(e.rel) && nodeIds.includes(e.from) && nodeIds.includes(e.to));
    gEdges = gEdges.map((e) => {
        let e2 = {from: e.from, to: e.to};
        let color = colors[relations.indexOf(e.rel)];
        if (color) {e2.color = color; e2.dashes = true}
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
    for (let cctype of cctypes) {
        let ulist = "";
        for (let n of unusedNodes) {
            if (n.type === cctype) {
                ulist += `<li>${n.label.replaceAll("-\n", "-")}</li>`;
            }
        }
        unrelated.innerHTML += `<strong>${cctype.toUpperCase()}</strong><ul>${ulist}</ul>`;
    }
}

