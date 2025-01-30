
///////////////////////////////////////////////////////////////////////////////
// The different graphs

const COLORS = {
    //                      // Closest MacOS color names:
    LightGreen: "#a0f000",  // #8efa00 (Lime)
    Orange:     "#ffc000",  // #ff9300 (Tangerine)
    LightGray:  "#d8c8c8",  // #c0c0c0 (Magnesium)
    Yellow:     "#f0d050",  // #ffd479 (Cantaloupe)
    Blue:       "#0080ff",  // #0096ff (Aqua)
    Purple:     "#c040ff",  // #9437ff (Grape)
    Magenta:    "#ff40ff",  // #ff40ff (Magenta)
    Green:      "#00c000",  // #008f00 (Clover)
    Red:        "#ff3000",  // #ff2600 (Maraschino)
    Teal:       "#0080b0",  // #009193 (Teal)
    Olive:      "#909000",  // #929000 (Aspargus)
    Brown:      "#a05000",  // #945200 (Mocha)
    Black:      "#000000",  // #000000 (Black)
};

var ccSettings = {};

ccSettings.nodes = {
    cxn: {color: COLORS.LightGreen},
    str: {color: COLORS.Orange},
    sem: {color: COLORS.LightGray},
    inf: {color: COLORS.Yellow},
};

ccSettings.edges = {
    SubtypeOf:     {color: 0},  // inherit from node color
    ConstituentOf: {color: COLORS.Blue},
    HeadOf:        {color: COLORS.Purple},
    AttributeOf:   {color: COLORS.Green},
    RoleOf:        {color: COLORS.Magenta},
    ExpressionOf:  {color: COLORS.Red,   dashed: true},
    ModeledOn:     {color: COLORS.Teal,  dashed: true, reversed: true},
    RecruitedFrom: {color: COLORS.Olive, dashed: true, reversed: true},
    FunctionOf:    {color: COLORS.Brown, dashed: true},
    AssociatedTo:  {color: COLORS.Black, dashed: true},
};

ccSettings.graphs = {
    cxn: {
        name: "Constructions",
        defaultrelation: "SubtypeOf",
        nodes: {cxn: true},
        edges: {SubtypeOf: true, ConstituentOf: true, HeadOf: true},
    },
    str: {
        name: "Strategies",
        defaultrelation: "SubtypeOf",
        nodes: {str: true},
        edges: {SubtypeOf: true, ConstituentOf: true},
    },
    sem: {
        name: "Semantic CCs",
        defaultrelation: "SubtypeOf",
        nodes: {sem: true},
        edges: {SubtypeOf: true, ConstituentOf: true, AttributeOf: true, RoleOf: true},
    },
    inf: {
        name: "Information packaging",
        defaultrelation: "SubtypeOf",
        nodes: {inf: true},
        edges: {SubtypeOf: true, ConstituentOf: true, AttributeOf: true},
    },
    cxn_str: {
        name: "Cxn ↔︎ Strategies",
        defaultrelation: "ExpressionOf",
        nodes: {cxn: true, str: true},
        edges: {SubtypeOf: true, ExpressionOf: true, ModeledOn: true, RecruitedFrom: true},
    },
    cxn_sem_inf: {
        name: "Cxn ↔︎ Sem. + Inf.",
        defaultrelation: "FunctionOf",
        nodes: {cxn: true, inf: true, sem: true},
        edges: {SubtypeOf: true, ConstituentOf: true, HeadOf: true, FunctionOf: true},
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
