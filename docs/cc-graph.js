
///////////////////////////////////////////////////////////////////////////////
// Global variables

var ccNodes, ccEdges; // Defined in cc-graph-data.js
var ccGraphs, networkOptions; // Defined in cc-graph-settings.js
var network;


///////////////////////////////////////////////////////////////////////////////
// Utility functions

// Get the current selected graph ID
function getGraph() {
    let select = document.getElementById("ccGraphType");
    return select.value || null;
}

// An object of the node ids that are in the selected (unfiltered) graph
function getGraphNodeIds() {
    if (!getGraph()) return {};
    let ccTypes = ccGraphs[getGraph()].nodecolors;
    let nodeIds = {};
    for (let n of ccNodes) {
        if (ccTypes[n.type] != null) nodeIds[n.id] = true;
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
    if (!getGraph()) return [];
    let ccTypes = ccGraphs[getGraph()].nodecolors;
    let relations = getGraphRelations();
    let nodeIds = {};
    for (let n of ccNodes) nodeIds[n.id] = ccTypes[n.type] != null;
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
    let graph = ccGraphs[getGraph()];
    if (!graph.edgecolors) return [];
    // Only show the checkboxes for the relations that are relevant to this graph.
    for (let lbl of document.getElementById("ccRelations").querySelectorAll("label")) {
        let color = graph.edgecolors[lbl.querySelector("input").id];
        if (color == null) {
            lbl.style.display = "none";
        } else {
            lbl.style.display = "";
            if (color === 0) {
                // Inherit label color from node color(s)
                let nodecolors = Object.values(graph.nodecolors);
                if (nodecolors.length > 1 && nodecolors[0] !== nodecolors[1]) {
                    color = `rgb(0 0 0 / 0%); background-image: linear-gradient(to right, ${nodecolors[0]}, ${nodecolors[1]}); background-clip: text;`;
                } else {
                    color = nodecolors[0];
                }
            }
            let style = `color: ${color}; filter: brightness(50%) saturate(400%);`;
            lbl.querySelector("span").style = style;
        }
    }
    let grelations = Object.keys(graph.edgecolors);
    let relations = grelations.filter((rel) => document.getElementById(rel).checked);
    if (relations.length === 0) {
        // If no relations are selected, use the default relation.
        let rel = graph.defaultrelation;
        document.getElementById(rel).checked = true;
        relations = [rel];
    }
    return relations;
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
        e.id = `${e.rel}--${e.from}--${e.to}`;
    }
    // Populate the graph type dropdown menu, and
    // create checkboxes for all relations
    let select = document.getElementById("ccGraphType");
    let checkboxes = document.getElementById("ccRelations");
    for (let graphID in ccGraphs) {
        let graph = ccGraphs[graphID];
        select.innerHTML += `<option value="${graphID}">${graph.name}</option>`;
        for (let relId in graph.edgecolors) {
            if (!document.getElementById(relId)) {
                checkboxes.innerHTML +=
                    `<label style="display:none">
                    <input type="checkbox" id="${relId}" onchange="changeSettings()"/>
                    <span>${relId}</span> &nbsp; </label>`;
            }
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
    document.getElementById("ccSearch").disabled = !getGraph();
    document.getElementById("ccClearSelection").disabled = !hasSelection;
    document.getElementById("ccSelectUnconnected").disabled = !hasUnconnected;
    document.getElementById("ccExpandUpwards").disabled = !hasSelection;
    document.getElementById("ccExpandDownwards").disabled = !hasSelection;
    document.getElementById("ccExpandOutwards").disabled = !hasSelection;
    document.getElementById("ccClearFilter").disabled = !filtered;
    document.getElementById("ccGrowUpwards").disabled = !filtered;
    document.getElementById("ccGrowDownwards").disabled = !filtered;
    document.getElementById("ccGrowOutwards").disabled = !filtered;
    document.getElementById("ccHideUnselected").disabled = !hasSelection;
    document.getElementById("ccHideSelected").disabled = !hasSelection;
    showStatistics();
}

// Show graph statistics and information
function showStatistics() {
    let stat = document.getElementById("statistics");
    if (!getGraph()) {
        stat.innerText = `${ccNodes.length} nodes; ${ccEdges.length} relations`;
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
    let graph = ccGraphs[getGraph()];
    for (let n of getGraphNodes()) {
        if (network.body.nodes[n.id]) {
            Object.assign(n, network.getPosition(n.id));
        }

        // Set node label
        let attr = document.getElementById("ccShow").value;
        n.label = n[attr].replaceAll("--", "-");
        // Word-wrapping, from: https://www.30secondsofcode.org/js/s/word-wrap/
        const wordwrap = /(?![^\n]{1,24}$)([^\n]{1,24}[\s-])/g;
        n.label = n.label.replace(wordwrap, '$1\n');

        // Set node color
        let color = graph.nodecolors[n.type];
        let border = graph.nodeborders && graph.nodeborders[n.type] || color;
        n.color = {background: color, border: border};
        }
}

// Update information about each graph edge
function updateEdges() {
    let graph = ccGraphs[getGraph()];
    for (let e of getGraphEdges()) {
        e.color = graph.edgecolors[e.rel];
        e.dashes = graph.edgedashes && graph.edgedashes[e.rel];
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
    if (!getGraph()) {
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
function revealNeighbors(direction) {
    let relations = getGraphRelations();
    let nodeIds = {};
    for (let n of network.body.nodeIndices) {
        nodeIds[n] = true;
        for (let e of ccEdges) {
            if (relations.includes(e.rel)) {
                if (n === e.from && direction !== 'from') nodeIds[e.to] = true;
                else if (n === e.to && direction !== 'to') nodeIds[e.from] = true;
            }
        }
    }
    setGraphData(nodeIds);
}

// Things to do when any kind of settings has changed
// The current selected nodes are kept (if any)
function changeSettings() {
    updateNodes();
    updateEdges();
    updateSolver();
    setGraphData(network.body.nodes);
}

// Update with a new fresh graph (clearing the selection, if any)
function selectGraph() {
    updateNodes();
    updateEdges();
    updateSolver();
    clearFilter();
}
