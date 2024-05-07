
///////////////////////////////////////////////////////////////////////////////
// Global variables

var ccNodes, ccEdges; // Defined in cc-graph-data.js
var network;
var isFiltered;

///////////////////////////////////////////////////////////////////////////////
// Global options

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
        multiselect: true,
        tooltipDelay: 1000,
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
        barnesHut: {
        },
        repulsion: {
            nodeDistance: 200,
            centralGravity: 0.1,
            springLength: 100,
        },
    },
};

var colors = {
    0: "lightgreen",
    1: "gold",

    // SubtypeOf: This will inherit from the node color
    ConstituentOf: "orangered", ExpressionOf: "orangered",
    HeadOf: "royalblue", ModeledOn: "royalblue", AttributeOf: "royalblue",
    RoleOf: "mediumorchid", RecruitedFrom: "mediumorchid",
    FillerOf: "darkgoldenrod", 
    ValueOf: "slategrey",
};

var dashes = {
    ModeledOn: true, RecruitedFrom: true,
    RoleOf: true, FillerOf: true,
    AttributeOf: true, ValueOf: true,
}

var ccNames = {
    cxn: "Constructions",
    str: "Strategies",
    "str+cxn": "Cxn -> Str",
    sem: "Semantic CCs",
    inf: "Information packaging",
};

var ccRelations = {
    cxn: ["SubtypeOf", "ConstituentOf", "HeadOf"],
    str: ["SubtypeOf", "ConstituentOf"],
    "str+cxn": ["SubtypeOf", "ExpressionOf", "ModeledOn", "RecruitedFrom"],
    sem: ["SubtypeOf", "ConstituentOf", "AttributeOf", "RoleOf", "FillerOf", "ValueOf"],
    inf: ["SubtypeOf", "ConstituentOf", "AttributeOf", "ValueOf"],
};


///////////////////////////////////////////////////////////////////////////////
// Utility functions

function getGraphTypes() {
    let select = document.getElementById("ccGraphType");
    return select.value ? select.value.split("+") : null;
}

function getGraphNodeIds() {
    let nodeIds = {};
    let ccTypes = getGraphTypes();
    if (ccTypes) {
        for (let n of ccNodes) {
            if (ccTypes.includes(n.type)) nodeIds[n.id] = true;
        }
    }
    return nodeIds;
}

function getGraphNodes() {
    let nodeIds = getGraphNodeIds();
    return ccNodes.filter((n) => nodeIds[n.id]);
}

function getGraphEdges() {
    let ccTypes = getGraphTypes();
    if (!ccTypes) return [];
    let relations = getGraphRelations();
    let nodeIds = {};
    for (let n of ccNodes) nodeIds[n.id] = ccTypes.includes(n.type);
    return ccEdges.filter((e) => 
        relations.includes(e.rel) && nodeIds[e.from] && nodeIds[e.to]
    );
}

function getFilteredNodes() {
    return ccNodes.filter((n) => network.body.nodes[n.id]);
}

function getFilteredEdges() {
    return ccEdges.filter((e) => network.body.edges[e.id]);
}

function isUnconnectedNode(n) {
    return network.getConnectedEdges(n.id).length === 0;
}

function getUnconnectedNodes() {
    return getFilteredNodes().filter(isUnconnectedNode);
}

function getGraphRelations() {
    let select = document.getElementById("ccGraphType");
    let relations = ccRelations[select.value];
    if (!relations) return [];
    // Only show the checkboxes for the relations that are relevant to this graph.
    for (let lbl of document.getElementById("ccRelations").querySelectorAll("label")) {
        let show = relations.includes(lbl.querySelector("input").id);
        lbl.style.display = show ? "" : "none";
    }
    relations = relations.filter((rel) => document.getElementById(rel).checked);
    if (relations.length === 0) {
        // If no relations are selected, check the first one.
        let rel = ccRelations[select.value][0];
        document.getElementById(rel).checked = true;
        relations = [rel];
    }
    return relations;
}

function setNodeLabel(n) {
    let attr = document.getElementById("ccShow").value;
    n.label = n[attr].replaceAll("--", "-").replaceAll(" ", "\n");
    if (attr === "id") n.label = n.label.replaceAll("-", "-\n");
}

function setNodeColor(n) {
    let color = colors[getGraphTypes().indexOf(n.type)];
    n.color = {background: color, border: color};
}


///////////////////////////////////////////////////////////////////////////////
// Initialisation

function init() {
    for (let e of ccEdges) {
        if (colors[e.rel]) e.color = colors[e.rel];
        e.dashes = dashes[e.rel];
        e.id = `${e.rel}--${e.from}--${e.to}`;
    }
    let select = document.getElementById("ccGraphType");
    let checkboxes = document.getElementById("ccRelations");
    for (let ccTypes in ccNames) {
        let ccName = ccNames[ccTypes];
        select.innerHTML += `<option value="${ccTypes}">${ccName}</option>`;
        let checked = true;
        for (let relId of ccRelations[ccTypes]) {
            if (!document.getElementById(relId)) {
                let style = (
                    colors[relId] ? `color:${colors[relId]}`
                    : `background-image: linear-gradient(to right, ${colors[0]}, ${colors[1]}); background-clip: text; color: rgb(0 0 0 / 40%)`
                );
                checkboxes.innerHTML += 
                    `<label style="display:none">
                    <input type="checkbox" id="${relId}" onchange="selectRelation()" ${checked?"checked":""}/>
                    <span style="${style}">${relId}</span> &nbsp; </label>`;
            }
            checked = false;
        }
    }
    let container = document.getElementById("ccNetwork");
    network = new vis.Network(container, {nodes:[], edges:[]}, networkOptions);
    network.on("selectNode", selectionChanged);
    network.on("deselectNode", selectionChanged);
    selectionChanged();
}


///////////////////////////////////////////////////////////////////////////////
// Updating the user interface

function selectionChanged() {
    let hasSelection = network.getSelectedNodes().length > 0;
    let hasUnconnected = getUnconnectedNodes().length > 0;
    let willStabilize = document.getElementById("ccStabilize").checked;
    document.getElementById("ccSolver").disabled = !willStabilize;
    document.getElementById("ccSearch").disabled = !getGraphTypes();
    document.getElementById("ccUnconnected").disabled = !hasUnconnected;
    document.getElementById("ccExpand").disabled = !hasSelection;
    document.getElementById("ccFilter").disabled = !hasSelection;
    document.getElementById("ccRemove").disabled = !hasSelection;
    document.getElementById("ccClear").disabled = !isFiltered;
    showStatistics();
}

function showStatistics() {
    let stat = document.getElementById("statistics");
    if (!getGraphTypes()) {
        stat.innerText = `${ccNodes.length} CCs; ${ccEdges.length} relations`;
        return;
    }
    let unconnected = getUnconnectedNodes().length;
    let selected = network.getSelectedNodes().length;
    stat.innerText = `${getFilteredNodes().length} nodes`;
    if (isFiltered) stat.innerText += ` (of ${getGraphNodes().length})`;
    if (unconnected > 0) stat.innerText += `, ${unconnected} unconnected`;
    if (selected > 0) stat.innerText += `, ${selected} selected`;
    stat.innerText += `; ${getFilteredEdges().length} edges`;
    if (isFiltered) stat.innerText += ` (of ${getGraphEdges().length})`;
}

function updateNodes() {
    for (let n of getGraphNodes()) {
        if (network.body.nodes[n.id]) {
            Object.assign(n, network.getPosition(n.id));
        }
        setNodeLabel(n);
        setNodeColor(n);
    }
}

function updateSolver() {
    let physics = {};
    physics.enabled = document.getElementById("ccStabilize").checked;
    if (physics.enabled) {
        physics.solver = document.getElementById("ccSolver").value;
    }
    network.setOptions({physics: physics});    
}


///////////////////////////////////////////////////////////////////////////////
// User interface actions

function searchNodes() {
    let searchBox = document.getElementById("ccSearch");
    if (!getGraphTypes()) {
        searchBox.value = "";
        return;
    }
    let searchTerm = searchBox.value.trim().replace(/\W+/g, ' ');
    if (searchTerm.length < 3) return;
    searchTerm = searchTerm.replaceAll(' ', '.*?');
    let regex = new RegExp(searchTerm, 'i');
    let selected = getGraphNodes().flatMap((n) => 
        network.body.nodes[n.id] && (regex.test(n.name) || regex.test(n.id)) ? n.id : []
    );
    network.selectNodes(selected);
    selectionChanged();
}

function selectUnconnected() {
    let unconnected = getUnconnectedNodes();
    if (unconnected.length === 0) return;
    network.selectNodes(unconnected.map((n) => n.id));
    selectionChanged();
}

function expandSelection() {
    let selected = network.getSelectedNodes();
    if (selected.length === 0) return;
    let newnodes = selected.flatMap((n) => network.getConnectedNodes(n));
    network.selectNodes(selected.concat(newnodes));
    selectionChanged();
}

function removeSelected() {
    let selected = network.getSelectedNodes();
    if (selected.length === 0) return;
    network.deleteSelected();
    network.selectNodes([]);
    isFiltered = true;
    selectionChanged();
}

function clearFilter() {
    let selected = network.getSelectedNodes();
    network.setData({nodes: getGraphNodes(), edges: getGraphEdges()});
    network.selectNodes(selected);
    isFiltered = false;
    document.getElementById("ccSearch").value = "";
    selectionChanged();
}

function filterSelected() {
    let selected = network.getSelectedNodes();
    if (selected.length === 0) return;
    let relations = getGraphRelations();
    let nodeIds = {};
    let radius = 2;
    let agenda = selected;
    for (let i = 0; i < radius; i++) {
        let newAgenda = [];
        for (let n of agenda) {
            if (!nodeIds[n]) {
                nodeIds[n] = true;
                for (let e of ccEdges) {
                    if (relations.includes(e.rel)) {
                        if (n === e.from) newAgenda.push(e.to);
                        else if (n === e.to) newAgenda.push(e.from);
                    }
                }
            }
        }
        agenda = newAgenda;
    }
    for (let n of agenda) nodeIds[n] = true;

    let filteredNodes = ccNodes.filter((n) => nodeIds[n.id]);
    let filteredEdges = ccEdges.filter((e) => relations.includes(e.rel) && nodeIds[e.from] && nodeIds[e.to]);
    network.setData({nodes: filteredNodes, edges: filteredEdges});
    network.selectNodes(selected);
    isFiltered = true;
    selectionChanged();
}

function changeSettings() {
    updateNodes();
    updateSolver();
    let selected = network.getSelectedNodes();
    network.setData({nodes: getFilteredNodes(), edges: getFilteredEdges()});
    network.selectNodes(selected);
    selectionChanged();
}

function selectRelation() {
    updateNodes();
    updateSolver();
    let selected = network.getSelectedNodes();
    if (!isFiltered) {
        network.setData({nodes: getGraphNodes(), edges: getGraphEdges()});
        document.getElementById("ccSearch").value = "";
    } else {
        let relations = getGraphRelations();
        let nodes = ccNodes.filter((n) => network.body.nodes[n.id]);
        let edges = ccEdges.filter((e) => relations.includes(e.rel) && network.body.nodes[e.from] && network.body.nodes[e.to]);
        network.setData({nodes: nodes, edges: edges});
    }
    network.selectNodes(selected);
    selectionChanged();
}

function selectGraph() {
    isFiltered = false;
    selectRelation();
}

