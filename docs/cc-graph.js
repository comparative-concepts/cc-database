
///////////////////////////////////////////////////////////////////////////////
// Global variables

var ccNodes, ccEdges; // Defined in cc-graph-data.js
var network;

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
        hover: true, // "nodes use their hover colors when the mouse moves over them"
        multiselect: true, // "a longheld click (or touch) as well as a control-click will add to the selection"
        tooltipDelay: 1000, // "the amount of time in milliseconds it takes before the tooltip is shown"
    },
    layout: {
        improvedLayout: true, // "the network will use the Kamada Kawai algorithm for initial layout"
        clusterThreshold: 1000, // "cluster threshold to which improvedLayout applies"
    },
    physics: {
        solver: "forceAtlas2Based",
        stabilization: {
            iterations: 100, // "stabilize the network on load up til a maximum number of iterations"
        },
        forceAtlas2Based: {
            theta: 0.5, // "higher values are faster but generate more errors, lower values are slower but with less errors"
            gravitationalConstant: -50, // "if you want the repulsion to be stronger, decrease the gravitational constant... falloff is linear instead of quadratic"
            centralGravity: 0.01, // "central gravity attractor to pull the entire network back to the center"
            springConstant: 0.1, // "higher values mean stronger springs"
            springLength: 100, // "the rest length of the spring"
            damping: 0.1, // "how much of the velocity from the previous physics simulation iteration carries over to the next iteration"
            avoidOverlap: 0, // "if > 0, the size of the node is taken into account"
        },
        repulsion: {
            centralGravity: 0.1,
            springLength: 100,
            springConstant: 0.1,
            nodeDistance: 200, // "range of influence for the repulsion"
            damping: 0.1,
        },
        barnesHut: {
            theta: 0.5,
            gravitationalConstant: -10000, // "...falloff is quadratic instead of linear"
            centralGravity: 1,
            springLength: 100,
            springConstant: 0.1,
            damping: 0.1,
            avoidOverlap: 0,
        },
    },
};

var colors = {
    // Node colors: (1) is only used if there are two CC types
    0: "lightgreen",
    1: "gold",

    // Relation/edge colors
    // SubtypeOf will inherit from the node color
    ConstituentOf: "red", ExpressionOf: "red",
    HeadOf: "royalblue", ModeledOn: "royalblue", AttributeOf: "royalblue",
    RoleOf: "mediumorchid", RecruitedFrom: "mediumorchid",
    FillerOf: "darkgoldenrod", 
};

var dashes = {
    // Which relations should be dashed
    ModeledOn: true, RecruitedFrom: true,
    RoleOf: true, FillerOf: true,
}

var ccNames = {
    // How the CC's should be shown in the drop-down menu
    cxn: "Constructions",
    str: "Strategies",
    "str+cxn": "Cxn -> Str",
    sem: "Semantic CCs",
    inf: "Information packaging",
};

var ccRelations = {
    // What relations should be included for each of the CC's
    cxn: ["SubtypeOf", "ConstituentOf", "HeadOf"],
    str: ["SubtypeOf", "ConstituentOf"],
    "str+cxn": ["SubtypeOf", "ExpressionOf", "ModeledOn", "RecruitedFrom"],
    sem: ["SubtypeOf", "ConstituentOf", "AttributeOf", "RoleOf", "FillerOf"],
    inf: ["SubtypeOf", "ConstituentOf", "AttributeOf"],
};


///////////////////////////////////////////////////////////////////////////////
// Utility functions

// What CC types are included in the graph
function getGraphTypes() {
    let select = document.getElementById("ccGraphType");
    return select.value ? select.value.split("+") : null;
}

// An object of the node ids that are in the selected (unfiltered) graph
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

// A list of the nodes in the selected (unfiltered) graph
function getGraphNodes() {
    let nodeIds = getGraphNodeIds();
    return ccNodes.filter((n) => nodeIds[n.id]);
}

// A list of the edges in the selected (unfiltered) graph
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

// A list of the filtered nodes - the nodes that are shown
function getFilteredNodes() {
    return ccNodes.filter((n) => network.body.nodes[n.id]);
}

// A list of the filtered edges - the edges that are shown
function getFilteredEdges() {
    return ccEdges.filter((e) => network.body.edges[e.id]);
}

// True if the graph is filtered
function isFiltered() {
    return network.body.nodeIndices.length < getGraphNodes().length;
}

// Test if a given node is unconnected (in the filtered graph)
function isUnconnectedNode(n) {
    return network.getConnectedEdges(n.id).length === 0;
}

// A list of all unconnected nodes
function getUnconnectedNodes() {
    return getFilteredNodes().filter(isUnconnectedNode);
}

// A list of all selected nodes
function getSelectedNodes() {
    let selectedNodeIds = network.getSelectedNodes();
    return getGraphNodes().filter((n) => selectedNodeIds.includes(n.id));
}

// A list of the relations that are currently selected
// Also decides which checkboxes to show, and
// it checks the default one if no relation is currently checked
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

// Set the label of the given node, depending on if the user has chosen to show names or ids
function setNodeLabel(n) {
    let attr = document.getElementById("ccShow").value;
    n.label = n[attr].replaceAll("--", "-").replaceAll(" ", "\n");
    if (attr === "id") n.label = n.label.replaceAll("-", "-\n");
}

// Set the color of the given node, depending on its CC type and the graph type
function setNodeColor(n) {
    let color = colors[getGraphTypes().indexOf(n.type)];
    n.color = {background: color, border: color};
}

function setGraphData(nodeIds) {
    if (!nodeIds) nodeIds = getGraphNodeIds();
    if (nodeIds instanceof Array) nodeIds = Object.fromEntries(nodeIds.map(n => [n, true]));
    let relations = getGraphRelations();
    let nodes = ccNodes.filter((n) => nodeIds[n.id]);
    let edges = ccEdges.filter((e) => relations.includes(e.rel) && nodeIds[e.from] && nodeIds[e.to]);
    console.log(new Date().toLocaleTimeString(), `Update graph: ${nodes.length} nodes, ${edges.length} edges`);
    let selected = network.getSelectedNodes();
    network.setData({nodes: nodes, edges: edges});
    network.selectNodes(selected);
    selectionChanged();
}


///////////////////////////////////////////////////////////////////////////////
// Initialisation

function init() {
    // Set unique ids for all edges
    for (let e of ccEdges) {
        if (colors[e.rel]) e.color = colors[e.rel];
        e.dashes = dashes[e.rel];
        e.id = `${e.rel}--${e.from}--${e.to}`;
    }
    // Populate the graph type dropdown menu, and 
    // create checkboxes for all relations
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
                    <input type="checkbox" id="${relId}" onchange="changeSettings()" ${checked?"checked":""}/>
                    <span style="${style}">${relId}</span> &nbsp; </label>`;
            }
            checked = false;
        }
    }
    // Create the global network object, and add event listeners
    let container = document.getElementById("ccNetwork");
    network = new vis.Network(container, {nodes:[], edges:[]}, networkOptions);
    network.on("selectNode", selectionChanged);
    network.on("deselectNode", selectionChanged);
    network.on("dragEnd", selectionChanged);
    network.on("startStabilizing", () => console.log(new Date().toLocaleTimeString(), `Stabilizing using solver ${document.getElementById("ccSolver").value}`));
    network.on("stabilized", (params) => console.log(new Date().toLocaleTimeString(), `Stabilization stopped after ${params.iterations} iterations`));
    selectionChanged();
}


///////////////////////////////////////////////////////////////////////////////
// Updating the user interface

// Enable/disable UI elements depending on the current selection, unconnected nodes, etc.
function selectionChanged() {
    let hasSelection = network.getSelectedNodes().length > 0;
    let hasUnconnected = getUnconnectedNodes().length > 0;
    let filtered = isFiltered();
    let willStabilize = document.getElementById("ccStabilize").checked;
    document.getElementById("ccSolver").disabled = !willStabilize;
    document.getElementById("ccSearch").disabled = !getGraphTypes();
    document.getElementById("ccClearSelection").disabled = !hasSelection;
    document.getElementById("ccSelectUnconnected").disabled = !hasUnconnected;
    document.getElementById("ccExpandUpwards").disabled = !hasSelection;
    document.getElementById("ccExpandDownwards").disabled = !hasSelection;
    document.getElementById("ccClearFilter").disabled = !filtered;
    document.getElementById("ccRevealNeighbors").disabled = !filtered;
    document.getElementById("ccHideUnselected").disabled = !hasSelection;
    document.getElementById("ccHideSelected").disabled = !hasSelection;
    showStatistics();
}

// Show graph statistics and information
function showStatistics() {
    let stat = document.getElementById("statistics");
    if (!getGraphTypes()) {
        stat.innerText = `${ccNodes.length} CCs; ${ccEdges.length} relations`;
        return;
    }
    let unconnected = getUnconnectedNodes().length;
    let selected = network.getSelectedNodes().length;
    let filtered = isFiltered();
    stat.innerText = `${getFilteredNodes().length} nodes`;
    if (filtered) stat.innerText += ` (of ${getGraphNodes().length})`;
    if (unconnected > 0) stat.innerText += `, ${unconnected} unconnected`;
    if (selected > 0) stat.innerText += `, ${selected} selected`;
    stat.innerText += `; ${getFilteredEdges().length} edges`;
    if (filtered) stat.innerText += ` (of ${getGraphEdges().length})`;

    let extraInfo = document.getElementById("extraInfo");
    extraInfo.innerHTML = "";
    if (selected > 0) {
        let info = getSelectedNodes().map((n) => n.label).join(", ").replaceAll("-\n", "-").replaceAll("\n", " ");
        extraInfo.innerHTML += `<p><b>Selected:</b> ${info}</p>`;
    }
    if (unconnected > 0) {
        let info = getUnconnectedNodes().map((n) => n.label).join(", ").replaceAll("-\n", "-").replaceAll("\n", " ");
        extraInfo.innerHTML += `<p><b>Unconnected:</b> ${info}</p>`;
    }
}

// Update information about each graph node
function updateNodes() {
    for (let n of getGraphNodes()) {
        if (network.body.nodes[n.id]) {
            Object.assign(n, network.getPosition(n.id));
        }
        setNodeLabel(n);
        setNodeColor(n);
    }
}

// Update the solving algorithm
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

// Select the nodes that match what is written in the search box
// You have to enter at least 3 characters for it to search
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

// Deselect all nodes
function clearSelection() {
    network.unselectAll();
    selectionChanged();
}

// Select the currently unconnected nodes
function selectUnconnected() {
    let unconnected = getUnconnectedNodes();
    if (unconnected.length === 0) return;
    network.selectNodes(unconnected.map((n) => n.id));
    selectionChanged();
}

// Expand the selection with the neighbor nodes in the direction of "to" or "from" 
function expandSelection(direction) {
    let selected = network.getSelectedNodes();
    if (selected.length === 0) return;
    let newnodes = selected.flatMap((n) => network.getConnectedNodes(n, direction));
    network.selectNodes(selected.concat(newnodes));
    selectionChanged();
}

// Clear the filter - i.e. show the full graph
function clearFilter() {
    document.getElementById("ccSearch").value = "";
    setGraphData();
}

// Remove the selected nodes from the current graph
function hideSelected() {
    let selected = network.getSelectedNodes();
    if (selected.length === 0) return;
    network.deleteSelected();
    network.selectNodes([]);
    selectionChanged();
}

// Remove all nodes from the graph that are not selected and not a neighbor to a selected node
function hideUnselected() {
    let selected = network.getSelectedNodes();
    if (selected.length === 0) return;
    setGraphData(selected);
}

// Expand the graph with nodes that are neighbors to currently visible nodes
function revealNeighbors() {
    let relations = getGraphRelations();
    let nodeIds = {};
    for (let n of network.body.nodeIndices) {
        nodeIds[n] = true;
        for (let e of ccEdges) {
            if (relations.includes(e.rel)) {
                if (n === e.from) nodeIds[e.to] = true;
                else if (n === e.to) nodeIds[e.from] = true;
            }
        }
    }
    setGraphData(nodeIds);
}

// Things to do when any kind of settings has changed
// The current selected nodes are kept (if any)
function changeSettings() {
    updateNodes();
    updateSolver();
    setGraphData(network.body.nodes);
}

// Update with a new fresh graph (clearing the selection, if any)
function selectGraph() {
    updateNodes();
    updateSolver();
    clearFilter();
}
