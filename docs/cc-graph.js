
///////////////////////////////////////////////////////////////////////////////
// Global variables

var DATA;     // Defined by graph-data.js
var SETTINGS; // Defined by graph-settings.js
var network;  // Defined by vis-network.js


///////////////////////////////////////////////////////////////////////////////
// Utility functions

// Get the current selected graph ID
function getGraph() {
    const select = document.getElementById("gvGraphType");
    return select.value || null;
}

// An object of the node ids that are in the selected (unfiltered) graph
function getGraphNodeIds() {
    if (!getGraph()) return {};
    const nodeTypes = SETTINGS.graphs[getGraph()].nodes;
    const nodeIds = {};
    for (const n of DATA.nodes) {
        if (nodeTypes[n.type] != null) nodeIds[n.id] = true;
    }
    return nodeIds;
}

// A list of the nodes in the selected (unfiltered) graph
function getGraphNodes() {
    const nodeIds = getGraphNodeIds();
    return DATA.nodes.filter((n) => nodeIds[n.id]);
}

// A list of the edges in the selected (unfiltered) graph
function getGraphEdges() {
    if (!getGraph()) return [];
    const nodeTypes = SETTINGS.graphs[getGraph()].nodes;
    const relations = getGraphRelations();
    const nodeIds = {};
    for (const n of DATA.nodes) nodeIds[n.id] = nodeTypes[n.type] != null;
    return DATA.edges.filter((e) =>
        relations.includes(e.rel) && nodeIds[e.from] && nodeIds[e.to]
    );
}

// A list of the filtered nodes - the nodes that are shown
function getFilteredNodes() {
    return DATA.nodes.filter((n) => network.body.nodes[n.id]);
}

// A list of the filtered edges - the edges that are shown
function getFilteredEdges() {
    return DATA.edges.filter((e) => network.body.edges[e.id]);
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
    const selectedNodeIds = network.getSelectedNodes();
    return getGraphNodes().filter((n) => selectedNodeIds.includes(n.id));
}

// A list of the relations that are currently selected
// Also decides which checkboxes to show, and
// it checks the default one if no relation is currently checked
function getGraphRelations() {
    const graph = SETTINGS.graphs[getGraph()];
    if (!graph) return [];
    // Only show the checkboxes for the relations that are relevant to this graph.
    for (const lbl of document.getElementById("gvRelations").querySelectorAll("label")) {
        const rel = lbl.querySelector("input").id;
        if (!graph.edges[rel]) {
            lbl.style.display = "none";
        } else {
            lbl.style.display = "";
            let color = SETTINGS.edges[rel].color;
            let bordercolor = color;
            if (color === 0) {
                // Inherit label color from node color(s)
                const nodecolors = Object.keys(graph.nodes).map((n) => SETTINGS.nodes[n].color);
                bordercolor = color = nodecolors[0];
                if (nodecolors.length > 1) {
                    color = `rgb(0 0 0 / 0%); background-image: linear-gradient(to right, ${nodecolors[0]}, ${nodecolors[1]}); background-clip: text;`;
                }
            }
            const style = `color: ${color}; filter: brightness(50%) saturate(400%); border-bottom-color: ${bordercolor}`;
            lbl.querySelector("span").style = style;
        }
    }
    const grelations = Object.keys(graph.edges);
    let relations = grelations.filter((rel) => document.getElementById(rel).checked);
    if (relations.length === 0) {
        // If no relations are selected, use the default relation.
        const rel = graph.defaultrelation;
        document.getElementById(rel).checked = true;
        relations = [rel];
    }
    return relations;
}

function setGraphData(nodeIds, rememberState = true) {
    if (nodeIds?.length > 0) {
        nodeIds = Object.fromEntries(nodeIds.map(n => [n, true]));
    } else {
        // Select the whole graph if no nodes are specified
        nodeIds = getGraphNodeIds();
    }
    const relations = getGraphRelations();
    const nodes = getGraphNodes().filter((n) => nodeIds[n.id]);
    const edges = getGraphEdges().filter((e) => relations.includes(e.rel) && nodeIds[e.from] && nodeIds[e.to]);
    const selected = network.getSelectedNodes();

    // Show the spinning wheel
    const spinner = document.getElementById("gvSpinningWheel");
    spinner.style.display = "";
    setTimeout(() => {
        const startTime = new Date();
        console.log(startTime.toLocaleTimeString(), `Update graph: ${nodes.length} nodes, ${edges.length} edges`);
        network.setData({nodes: nodes, edges: edges});
        const endTime = new Date();
        const elapsedTime = (endTime.valueOf()-startTime.valueOf())/1000;
        const speed = nodes.length / elapsedTime;
        console.log(endTime.toLocaleTimeString(), `Graph updated in ${elapsedTime.toFixed(2)} s, ${speed.toFixed(1)} nodes/s`);

        network.selectNodes(selected);
        selectionChanged();
        // The default is to remember the new state in the browser history
        if (rememberState) pushCurrentState();
        // Remove the spinning wheel 0.5 seconds after the network is loaded
        setTimeout(() => {spinner.style.display = "none"}, 500);
    }, 10);
}


///////////////////////////////////////////////////////////////////////////////
// Storing the current state in the URL and allow for undo

// Initialise the browser history, and the load graph specified in the URL hash
function initHistory() {
    window.addEventListener("popstate", (event) => {
        updateGraphFromState(event.state);
    });
    const url = new URL(window.location.href);
    try {
        updateGraphFromState(decodeState(url.hash));
    } catch (err) {
        alert(`Malformed state in URL!\n${err}`);
        selectGraph();
    }
    pushCurrentState(true);
}

// Remember the current graph in the browser history, and the URL hash
function pushCurrentState(force = false) {
    const state = getCurrentState()
    const url = new URL(window.location.href);
    url.hash = encodeState(state);
    if (force || url.hash !== window.location.hash) {
        history.pushState(state, "", url.href);
    }
}

// Load the graph specified in a given state
function updateGraphFromState(state) {
    if (!state) return;
    if (state.version && state.version !== DATA.version) {
        throw new TypeError(`Wrong database version: ${state.version}`);
    }
    if (!(state.graph in SETTINGS.graphs)) {
        throw new TypeError(`Unrecognised graph: ${state.graph}`);
    }
    document.getElementById("gvGraphType").value = state.graph;
    for (const rel in SETTINGS.edges) {
        document.getElementById(rel).checked = state.relations.includes(rel);
    }
    updateGraph();
    const possibleNodeIds = getGraphNodeIds();
    for (const nodeId of state.nodes) {
        if (!(nodeId in possibleNodeIds))
            throw new TypeError(`Node ${nodeId} is not in graph ${state.graph}`);
    }
    // Set the graph, but make sure not to push the state to the browser history
    setGraphData(state.nodes, false);
}

// Get the current state of the graph
function getCurrentState() {
    if (!getGraph()) return null;
    const nodes = isFiltered() ? network.body.nodeIndices : null;
    return {version: DATA.version, graph: getGraph(), relations: getGraphRelations(), nodes: nodes};
}

// Encode a graph state into a URL query/hash string
function encodeState(state) {
    if (!state) return "";
    const params = new URLSearchParams();
    if (state.version) params.set("v", state.version);
    params.set("g", state.graph);
    params.set("r", state.relations.join(" "));
    if (state.nodes?.length > 0) {
        const nodes = Object.fromEntries(state.nodes.map((id) => [id, true]));
        const nodeNumbers = DATA.nodes.flatMap((node, n) => node.id in nodes ? n : []);
        nodeNumbers.sort();
        if (DATA.nodes.length < 2**12 && nodeNumbers.length * 2 < DATA.nodes.length / 6) {
            // We encode the list of node numbers instead of the bit array.
            // We need two base64 chars to store each node,
            // this gives 2*6 = 12 bits, so we can handle up to 2^12 = 4096 nodes.
            const buffer = [];
            for (const n of nodeNumbers) {
                const base64 = toBase64([0, Math.trunc(n / 256), n % 256]);
                buffer.push(base64.substring(2));
            }
            params.set("n", buffer.join(""));
        } else {
            // We encode the bit array instead of the node numbers.
            // We can store 6 bits in each base64 char.
            const buffer = new Uint8Array(Math.ceil(DATA.nodes.length / 8));
            for (const n of nodeNumbers) {
                const bin = Math.trunc(n / 8);
                const mask = 1 << (n % 8);
                buffer[bin] |= mask;
            }
            params.set("h", toBase64(buffer));
        }
    }
    return params.toString();
}

// Decode a URL query/hash string into a graph state
function decodeState(encoded) {
    encoded = encoded.replace("#", "");
    if (!encoded) return;
    const params = new URLSearchParams(encoded);
    const version = (params.get("v") || "").trim();
    const graph = (params.get("g") || "").trim();
    const relations = (params.get("r") || "").split(/ +/);
    const nodeNumbers = [];
    if (params.get("n")) {
        // The string encodes the list of node numbers instead of the bit array.
        for (const s of params.get("n").match(/.{2}/g)) {
            const [_, high, low] = fromBase64("AA" + s);
            nodeNumbers.push(high * 256 + low);
        }
    } else if (params.get("h")) {
        // The string encodes the bit array instead of the list of node numbers.
        const buffer = fromBase64(params.get("h"));
        if (buffer) {
            for (let n = 0; n < DATA.nodes.length; n++) {
                const bin = Math.trunc(n / 8);
                const mask = 1 << (n % 8);
                if (buffer[bin] & mask) nodeNumbers.push(n);
            }
        }
    }
    const nodes = nodeNumbers.map((n) => DATA.nodes[n].id);
    return {version: version, graph: graph, relations: relations, nodes: nodes};
}

// Encode a byte array in query-safe base64 character encoding
function toBase64(buffer) {
    const base64 = btoa(String.fromCharCode(...buffer));
    // "+/=" are treated specially in query-strings, so replace them
    return base64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

// Decode a query-safe base64 string into a byte array
function fromBase64(encoded) {
    const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt());
}


///////////////////////////////////////////////////////////////////////////////
// Initialisation

function initialize() {
    // Hide the graph loader (spinning wheel) from the start
    document.getElementById("gvSpinningWheel").style.display = "none";
    initGraphData();
    // Populate the graph type dropdown menu, and
    // create checkboxes for all relations
    const select = document.getElementById("gvGraphType");
    const checkboxes = document.getElementById("gvRelations");
    for (const graphID in SETTINGS.graphs) {
        const graph = SETTINGS.graphs[graphID];
        select.innerHTML += mkElem('option', {value:graphID}, graph.name);
        for (const relId in graph.edges) {
            if (!document.getElementById(relId)) {
                checkboxes.innerHTML +=
                    mkElem("label", {style:"display:none"},
                        mkElem("input", {type:"checkbox", id:relId, onchange:"changeSettings()"}),
                        " ",
                        mkElem("span", SETTINGS.edges[relId]?.name || relId),
                        " &nbsp ",
                    );
            }
        }
    }
    // Create the global network object, and add event listeners
    const container = document.getElementById("gvNetwork");
    network = new vis.Network(container, {nodes:[], edges:[]}, SETTINGS.network);
    network.on("selectNode", selectionChanged);
    network.on("deselectNode", selectionChanged);
    network.on("dragEnd", selectionChanged);

    let stabilizationStartTime = null;
    network.on("startStabilizing", () => {
        stabilizationStartTime = new Date();
        console.log(stabilizationStartTime.toLocaleTimeString(), `Stabilizing using solver ${document.getElementById("gvSolver").value}`);
    });
    network.on("stabilized", (params) => {
        const stabilizationEndTime = new Date();
        const elapsedTime = stabilizationStartTime ? (stabilizationEndTime.valueOf() - stabilizationStartTime.valueOf())/1000 : NaN;
        const speed = params.iterations / elapsedTime;
        console.log(stabilizationEndTime.toLocaleTimeString(),
            `Stabilization stopped after ${params.iterations} iterations, ${elapsedTime.toFixed(1)} s, ${speed.toFixed(1)} iter/s`
        );
    });

    selectionChanged();
    initHistory();
}

function initGraphData() {
    for (const e of DATA.edges) {
        // Set the direction of the edge
        if (SETTINGS.edges[e.rel].reversed) {
            e.from = e.end; e.to = e.start;
        } else {
            e.from = e.start; e.to = e.end;
        }
        // Set a unique id for the edge
        e.id = `${e.rel}--${e.from}--${e.to}`;
    }
}


///////////////////////////////////////////////////////////////////////////////
// Updating the user interface

// Enable/disable UI elements depending on the current selection, unconnected nodes, etc.
function selectionChanged() {
    const hasSelection = network.getSelectedNodes().length > 0;
    const hasUnselected = network.getSelectedNodes().length < getFilteredNodes().length;
    const hasUnconnected = getUnconnectedNodes().length > 0;
    const filtered = isFiltered();
    const willStabilize = document.getElementById("gvStabilize").checked;
    document.getElementById("gvSolver").disabled = !willStabilize;
    document.getElementById("gvSearch").disabled = !getGraph();
    document.getElementById("gvClearSelection").disabled = !hasSelection;
    document.getElementById("gvSelectVisible").disabled = !hasUnselected;
    document.getElementById("gvSelectUnconnected").disabled = !hasUnconnected;
    document.getElementById("gvExpandUpwards").disabled = !hasSelection;
    document.getElementById("gvExpandDownwards").disabled = !hasSelection;
    document.getElementById("gvExpandOutwards").disabled = !hasSelection;
    document.getElementById("gvClearFilter").disabled = !filtered;
    document.getElementById("gvGrowUpwards").disabled = !filtered;
    document.getElementById("gvGrowDownwards").disabled = !filtered;
    document.getElementById("gvGrowOutwards").disabled = !filtered;
    document.getElementById("gvHideUnselected").disabled = !hasSelection;
    document.getElementById("gvHideSelected").disabled = !hasSelection;
    showStatistics();
}

// Show graph statistics and information
function showStatistics() {
    document.getElementById("infoVersion").innerHTML =
        DATA.version ? mkElem("p", mkElem("b", "Database version: "), DATA.version) : "";
    const graphInfo = document.getElementById("infoGraph");
    let graphInfoText = mkElem("b", "Current graph: ");
    if (!getGraph()) {
        graphInfoText += `${DATA.nodes.length} nodes; ${DATA.edges.length} relations`;
        graphInfo.innerHTML = mkElem("p", graphInfoText);
        return;
    }
    const unconnected = getUnconnectedNodes();
    const selected = getSelectedNodes();
    const filtered = isFiltered();
    graphInfoText += `${getFilteredNodes().length} nodes`;
    if (filtered) graphInfoText += ` (of ${getGraphNodes().length})`;
    if (unconnected.length > 0) graphInfoText += `, ${unconnected.length} unconnected`;
    if (selected.length > 0) graphInfoText += `, ${selected.length} selected`;
    graphInfoText += `; ${getFilteredEdges().length} edges`;
    if (filtered) graphInfoText += ` (of ${getGraphEdges().length})`;
    graphInfo.innerHTML = mkElem("p", graphInfoText);

    for (const [nodes, title] of [[selected, "Selected"], [unconnected, "Unconnected"]]) {
        const infoNode = document.getElementById("info" + title);
        if (nodes === selected && nodes.length === 1) {
            const node = nodes[0];
            const infoAttr = SETTINGS?.general?.info?.attribute;
            infoNode.innerHTML = mkElem("p",
                mkElem("b", linkToNodeInfo(node, `${node.name} (${node.type})`), ": "),
                removeLinks(node[infoAttr]) || SETTINGS?.general?.info?.unkonwn || "",
            );
        } else if (nodes.length > 0) {
            infoNode.innerHTML = mkElem("p",
                mkElem("b", title + ": "),
                ": ",
                nodes.map(
                    (n) => linkToNodeInfo(n, n.name)
                ).join(", "),
            );
        } else {
            infoNode.innerHTML = "";
        }
    }
}

// Update information about graph nodes, edges, and the solver
function updateGraph() {
    updateNodes();
    updateEdges();
    updateSolver();
}

// Update information about each graph node
function updateNodes() {
    for (const n of getGraphNodes()) {
        if (network.body.nodes[n.id]) {
            Object.assign(n, network.getPosition(n.id));
        }

        // Set node label
        const attr = document.getElementById("gvShow").value;
        // Word-wrapping, from: https://www.30secondsofcode.org/js/s/word-wrap/
        const wordwrap = /(?![^\n]{1,24}$)([^\n]{1,24}[\s-])/g;
        n.label = n[attr].replace(wordwrap, '$1\n');

        // Set node color
        const color = SETTINGS.nodes[n.type].color;
        const border = SETTINGS.nodes[n.type].border || color;
        n.color = {background: color, border: border};

        // This is what is shown when you hover over a node
        n.title = document.createElement("div");
        const infoAttr = SETTINGS?.general?.info?.attribute;
        n.title.innerHTML = mkElem("span",
            mkElem("b", `${n.name} (${n.type})`),
            "<br/>",
            removeLinks(n[infoAttr]) || SETTINGS?.general?.info?.unkonwn || "",
        );
    }
}

// Update information about each graph edge
function updateEdges() {
    for (const e of getGraphEdges()) {
        e.color = SETTINGS.edges[e.rel].color;
        e.dashes = SETTINGS.edges[e.rel].dashed;
    }
    for (const checkbox of document.querySelectorAll('#ccRelations input[type=checkbox]')) {
        const rel = checkbox.id;
        const dashed = SETTINGS.edges[rel].dashed || false;
        checkbox.nextElementSibling.classList.toggle("dashedBorder", dashed);
    }
}

// Update the solving algorithm
function updateSolver() {
    const physics = {};
    physics.enabled = document.getElementById("gvStabilize").checked;
    if (physics.enabled) {
        physics.solver = document.getElementById("gvSolver").value;
    }
    network.setOptions({physics: physics});
}


///////////////////////////////////////////////////////////////////////////////
// User interface actions

// Select the nodes that match what is written in the search box
// You have to enter at least 3 characters for it to search
function searchNodes() {
    const searchBox = document.getElementById("gvSearch");
    if (!getGraph()) {
        searchBox.value = "";
        return;
    }
    let searchTerm = searchBox.value.trim().replace(/\W+/g, ' ');
    if (searchTerm.length < 3) return;
    searchTerm = searchTerm.replaceAll(' ', '.*?');
    const regex = new RegExp(searchTerm, 'i');
    const selected = getGraphNodes().flatMap((n) =>
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

// Select all visible nodes
function selectVisible() {
    const visible = getFilteredNodes();
    if (visible.length === 0) return;
    network.selectNodes(visible.map((n) => n.id));
    selectionChanged();
}

// Select the currently unconnected nodes
function selectUnconnected() {
    const unconnected = getUnconnectedNodes();
    if (unconnected.length === 0) return;
    network.selectNodes(unconnected.map((n) => n.id));
    selectionChanged();
}

// Expand the selection with the neighbor nodes in the direction of "to" or "from"
function expandSelection(direction) {
    const selected = network.getSelectedNodes();
    if (selected.length === 0) return;
    const newnodes = selected.flatMap((n) => network.getConnectedNodes(n, direction));
    network.selectNodes(selected.concat(newnodes));
    selectionChanged();
}

// Clear the filter - i.e. show the full graph
function clearFilter() {
    document.getElementById("gvSearch").value = "";
    setGraphData();
}

// Remove the selected nodes from the current graph
function hideSelected() {
    const selected = network.getSelectedNodes();
    if (selected.length === 0) return;
    const visible = getFilteredNodes().map((n) => n.id);
    const remaining = visible.filter((n) => !selected.includes(n));
    network.selectNodes([]);
    setGraphData(remaining);
}

// Remove all nodes from the graph that are not selected and not a neighbor to a selected node
function hideUnselected() {
    const selected = network.getSelectedNodes();
    if (selected.length === 0) return;
    setGraphData(selected);
}

// Expand the graph with nodes that are neighbors to currently visible nodes
function revealNeighbors(direction) {
    const relations = getGraphRelations();
    const nodeIds = {};
    let nodesToGrow = getSelectedNodes();
    if (nodesToGrow.length === 0) {
        // If no nodes are selected, grow from all visible nodes
        nodesToGrow = getFilteredNodes();
    }
    for (const n of nodesToGrow) {
        for (const e of DATA.edges) {
            if (relations.includes(e.rel)) {
                if (n.id === e.from && direction !== 'from') nodeIds[e.to] = true;
                else if (n.id === e.to && direction !== 'to') nodeIds[e.from] = true;
            }
        }
    }
    if (Object.keys(nodeIds).length > 0) {
        for (const n of network.body.nodeIndices)
            nodeIds[n] = true;
        setGraphData(Object.keys(nodeIds));
    }
}

// Things to do when any kind of settings has changed
// The current selected nodes are kept (if any)
function changeSettings() {
    updateGraph();
    setGraphData(network.body.nodeIndices);
}

// Update with a new fresh graph (clearing the selection, if any)
function selectGraph() {
    updateGraph();
    clearFilter();
}


/* ------------------------------------------------------------------------- */
// HTML utilities

function mkElem(elem, attrs, ...content) {
    if (attrs == null) attrs = {};
    if (typeof attrs === 'string') {
        content = [attrs].concat(content);
        attrs = {};
    }
    attrs = Object.keys(attrs).map((k) => ` ${k}="${attrs[k]}"`).join('');
    content = content.join('');
    return `<${elem}${attrs}>${content}</${elem}>`;
}

function linkToNodeInfo(node, ...content) {
    const linkAttr = SETTINGS?.general?.links?.attribute;
    if (!node[linkAttr]) {
        return mkElem("span", ...content);
    }
    const attrs = {
        href: (SETTINGS?.general?.links?.baseURL || "") + node[linkAttr],
        target: SETTINGS?.general?.links?.target || "_blank",
    };
    return mkElem("a", attrs, ...content);
}

function removeLinks(html) {
    if (!html) return "";
    return html.replaceAll(/<a [^<>]+>|<\/a>/g, "");
}

function convertHTMLtoText(html) {
    return html.replaceAll(/<[a-zA-Z/].*?>/g, "");
}
