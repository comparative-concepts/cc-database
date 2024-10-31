
///////////////////////////////////////////////////////////////////////////////
// The different graphs

var ccGraphs = {};

ccGraphs.cxn = {
    name: "Constructions",
    defaultrelation: "SubtypeOf",
    nodecolors: {
        cxn: "LightGreen",
    },
    edgecolors: {
        SubtypeOf: 0,  // inherit from node color
        ConstituentOf: "RoyalBlue",
        HeadOf: "Red",
    },
};

ccGraphs.str = {
    name: "Strategies",
    defaultrelation: "SubtypeOf",
    nodecolors: {
        str: "Gold",
    },
    edgecolors: {
        SubtypeOf: 0,  // inherit from node color
        ConstituentOf: "RoyalBlue",
    },
};

ccGraphs.sem = {
    name: "Semantic CCs",
    defaultrelation: "SubtypeOf",
    nodecolors: {
        sem: "LightGray",
    },
    edgecolors: {
        SubtypeOf: 0,  // inherit from node color
        ConstituentOf: "RoyalBlue",
        AttributeOf: "Red",
        RoleOf: "LimeGreen",
        FillerOf: "MediumOrchid",
    },
    edgedashes: {RoleOf: true, FillerOf: true},
};

ccGraphs.inf = {
    name: "Information packaging",
    defaultrelation: "SubtypeOf",
    nodecolors: {
        inf: "Khaki",
    },
    edgecolors: {
        SubtypeOf: 0,  // inherit from node color
        ConstituentOf: "RoyalBlue",
        AttributeOf: "Red",
    },
};

ccGraphs.cxn_str = {
    name: "Cxn ↔︎ Strategies",
    defaultrelation: "ExpressionOf",
    nodecolors: {
        cxn: "LightGreen",
        str: "Gold",
    },
    edgecolors: {
        SubtypeOf: 0,  // inherit from node colors
        ExpressionOf: "RoyalBlue",
        ModeledOn: "Red",
        RecruitedFrom: "MediumOrchid",
    },
    edgedashes: {ModeledOn: true, RecruitedFrom: true},
};

ccGraphs.cxn_sem = {
    name: "Cxn ↔︎ Semantic CCs",
    defaultrelation: "FunctionOf",
    nodecolors: {
        cxn: "LightGreen",
        sem: "LightGray",
    },
    edgecolors: {
        SubtypeOf: 0,  // inherit from node colors
        FunctionOf: "MediumOrchid",
    },
};

ccGraphs.cxn_inf = {
    name: "Cxn ↔︎ Inf.packaging",
    defaultrelation: "FunctionOf",
    nodecolors: {
        cxn: "LightGreen",
        inf: "Khaki",
    },
    edgecolors: {
        SubtypeOf: 0,  // inherit from node colors
        FunctionOf: "MediumOrchid",
    },
};


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
