
var options = {};
// options.layout = {
//     improvedLayout: false,
// };

options.edges = {
    width: 4,
    arrows: "to",
};

options.nodes = {
    shape: "box",
};

options.groups = {
    def: {color: "lightgrey"},
    cxn: {color: "gold"},
    str: {color: "pink"},
    sem: {color: "lightgreen"},
    inf: {color: "skyblue"},
};

var network;

function init() {
    let select = document.getElementById("ccGraphType");
    for (let rel in ccRelations) {
        select.innerHTML += `<hr/>`;
        for (let cctypes of ccRelations[rel]) {
            let val = rel + "-" + cctypes.join("+");
            let lbl = rel + ": " + cctypes.map((c) => c.toUpperCase()).join(" &rarr; ");
            select.innerHTML += `<option value="${val}">${lbl}</option>`;
        }
    }
    document.getElementById("statistics").innerHTML = `${ccNodes.length} CCs, ${ccEdges.length} edges.`;
    let container = document.getElementById("ccNetwork");
    network = new vis.Network(container, {nodes:[], edges:[]}, options);
}

function selectGraph() {
    let select = document.getElementById("ccGraphType");
    if (!select.value) return;
    let [rel, cct] = select.value.split("-");
    let relations = rel.split("+");
    let cctypes = cct.split("+");

    let showID = document.getElementById("ccShowId").checked;
    let nodes = ccNodes.filter((n) => cctypes.includes(n.group));
    nodes = nodes.map((n) => {
        return {id: n.id, group: n.group, label: showID ? n.id : n.label};
    });
    let nodeIds = nodes.map((n) => n.id);
    let edges = ccEdges.filter((e) => relations.includes(e.rel) && nodeIds.includes(e.from) && nodeIds.includes(e.to));
    let usedIds = {};
    for (let e of edges) usedIds[e.from] = usedIds[e.to] = true;
    let unusedNodes = nodes.filter((n) => !usedIds[n.id]);
    nodes = nodes.filter((n) => usedIds[n.id]);
    console.log(`${select.options[select.selectedIndex].text}. Edges: ${edges.length}. Nodes: ${nodes.length}. Unused: ${unusedNodes.length}.`);
    network.setData({nodes: nodes, edges: edges});

    document.getElementById("statistics").innerHTML = `${nodes.length} CCs, ${edges.length} edges.`;

    if (!unusedNodes.length) return;
    unusedNodes.sort((a,b) => a.label.localeCompare(b.label));
    let unrelated = document.getElementById("ccUnrelated");
    unrelated.innerHTML = `<h3>${unusedNodes.length} unrelated CCs</h3>`;
    for (let cctype of cctypes) {
        let ulist = "";
        for (let n of unusedNodes) {
            if (n.group === cctype) {
                ulist += `<li>${n.label}</li>`;
            }
        }
        unrelated.innerHTML += `<strong>${cctype.toUpperCase()}</strong><ul>${ulist}</ul>`;
    }
}

