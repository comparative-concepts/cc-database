
var networkOptions = {
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
        solver: "forceAtlas2Based", // barnesHut, repulsion
        stabilization: {
            iterations: 100,
        },
        forceAtlas2Based: {
            theta: 0.3,
            springLength: 100,
        },
        repulsion: {
            nodeDistance: 200,
            centralGravity: 0.1,
            springLength: 100,
        },
    },
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
    network = new vis.Network(container, {nodes:[], edges:[]}, networkOptions);

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
    // network.on("dragStart", (params) => {
    //     network.setOptions({physics: {enabled: false}});
    // });
    // network.on("dragEnd", (params) => {
    //     network.setOptions({physics: {enabled: true}});
    // });
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
    let selected = gNodes.flatMap((n) => {
        if (!regex.test(n.name) && !regex.test(n.id)) return [];
        return n.id;
    });
    network.setSelection({nodes: selected});
}

function selectGraph() {
    let select = document.getElementById("ccGraphType");
    if (!select.value) return;
    let ccTypes = select.value.split("+");
    let relations = graphRelations[select.value];

    // Only show the checkboxes for the relations that are relevant to this graph.
    for (let lbl of document.getElementById("ccRelations").querySelectorAll("label")) {
        let show = relations.includes(lbl.querySelector("input").id);
        lbl.style.display = show ? "" : "none";
    }
    relations = relations.filter((rel) => document.getElementById(rel).checked);
    if (relations.length === 0) {
        // If no relations are selected, check the first one.
        let rel = graphRelations[select.value][0];
        document.getElementById(rel).checked = true;
        relations = [rel];
    }

    // Use current node positions as starting points for stabilization.
    let nodePos = {};
    for (let n of gNodes || []) nodePos[n.id] = network.getPosition(n.id);

    let showID = document.getElementById("ccShow").value === "id";
    gNodes = ccNodes.flatMap((n) => {
        // Select only the nodes of the relevant CC type.
        if (!ccTypes.includes(n.type)) return [];
        let lbl = showID ? n.id.replaceAll("-", "-\n") : n.label.replaceAll(" ", "\n");
        let color = colors[ccTypes.indexOf(n.type)];
        let n2 = {id: n.id, name: n.label, label: lbl, type: n.type, color: {background: color, border: color}};
        Object.assign(n2, nodePos[n.id]);
        return n2;
    });
    let nodeIds = gNodes.map((n) => n.id);

    gEdges = ccEdges.flatMap((e) => {
        // Select only the edges that go between two visible nodes.
        if (!(relations.includes(e.rel) && nodeIds.includes(e.from) && nodeIds.includes(e.to))) return [];
        let e2 = {from: e.from, to: e.to};
        e2.color = colors[e.rel];
        return e2;
    });

    // Remember the nodes that are not used in this graph.
    let usedIds = {};
    for (let e of gEdges) usedIds[e.from] = usedIds[e.to] = true;
    let unusedNodes = gNodes.filter((n) => !usedIds[n.id]);
    gNodes = gNodes.filter((n) => usedIds[n.id]);
    console.log(`${select.options[select.selectedIndex].text}. Edges: ${gEdges.length}. Nodes: ${gNodes.length}. Unused: ${unusedNodes.length}.`);

    // Set the stabilization solver.
    let solver = document.getElementById("ccSolver").value;
    let options = {physics: {solver: solver}};
    network.setOptions(options);

    // Set the new nodes and edges.
    network.setData({nodes: gNodes, edges: gEdges});
    document.getElementById("ccSearch").value = "";

    // Calculate and show information and statistics.
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

