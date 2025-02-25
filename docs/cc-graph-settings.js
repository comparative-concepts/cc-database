
var SETTINGS = {};

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

// Attributes for the different node types
// Currently supporting: color, border (default=color)
SETTINGS.nodes = {
    cxn: {color: COLORS.LightGreen},
    str: {color: COLORS.Orange},
    sem: {color: COLORS.LightGray},
    inf: {color: COLORS.Yellow},
};

// Attributes for the different edge types (relations)
// Currently supporting: name, color, dashed (default=false), reversed (default=false)
SETTINGS.edges = {
    SubtypeOf:     {name: "Subtype",     color: 0},  // inherit from node color
    ConstituentOf: {name: "Constituent", color: COLORS.Blue},
    HeadOf:        {name: "Head",        color: COLORS.Purple},
    AttributeOf:   {name: "Attribute",   color: COLORS.Green},
    RoleOf:        {name: "Role",        color: COLORS.Magenta},
    ExpressionOf:  {name: "Expression",  color: COLORS.Red,   dashed: true},
    ModeledOn:     {name: "Model",       color: COLORS.Teal,  dashed: true, reversed: true},
    RecruitedFrom: {name: "Recruitment", color: COLORS.Olive, dashed: true, reversed: true},
    FunctionOf:    {name: "Function",    color: COLORS.Brown, dashed: true},
};

// Attributes for the different graphs
// Currently supporting: name, defaultrelation, nodes, edges
SETTINGS.graphs = {
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
        edges: {SubtypeOf: true, ExpressionOf: true, ModeledOn: true, RecruitedFrom: true, ConstituentOf: true, HeadOf: true},
    },
    cxn_sem_inf: {
        name: "Cxn ↔︎ Sem. + Inf.",
        defaultrelation: "FunctionOf",
        nodes: {cxn: true, inf: true, sem: true},
        edges: {SubtypeOf: true, ConstituentOf: true, HeadOf: true, FunctionOf: true},
    },
};

// General settings
SETTINGS.general = {
    info: {
        attribute: "definition",     // which attribute in DATA.nodes contains the on-hover information?
        unkonwn: "[no definition]",  // info to show if missing
    },
    links: {
        attribute: "id",             // which attribute in DATA.nodes contains the outgoing link?
        baseURL: "index-html#",
        target: "CC-database",
    },
}


///////////////////////////////////////////////////////////////////////////////
// Options for the vis-network library, more info here:
// https://visjs.github.io/vis-network/docs/network/

SETTINGS.network = {
    edges: {
        width: 3,                // "width of the edge"
        arrows: "to",            // "for example: 'to, from, middle'  or 'to;from', any combination is fine"
    },
    nodes: {
        borderWidth: 1,          // "width of the border of the node"
        shape: "box",            // "the types with the label inside of it are: ellipse, circle, database, box, text"
    },
    interaction: {
        hover: true,             // "nodes use their hover colors when the mouse moves over them"
        multiselect: true,       // "a longheld click (or touch) as well as a control-click will add to the selection"
        tooltipDelay: 1000,      // "the amount of time in milliseconds it takes before the tooltip is shown"
    },
    layout: {
        improvedLayout: true,    // "the network will use the Kamada Kawai algorithm for initial layout"
        clusterThreshold: 1000,  // "cluster threshold to which improvedLayout applies"
    },
    physics: {
        solver: "forceAtlas2Based",       // Default solver
        stabilization: {
            iterations: 100,              // "stabilize the network on load up till a maximum number of iterations"
        },
        forceAtlas2Based: {
            theta: 0.5,                   // "higher values are faster but generate more errors, lower values are slower but with less errors"
            gravitationalConstant: -50,   // "the value is negative - if you want the repulsion to be stronger, decrease the value"
            centralGravity: 0.01,         // "central gravity attractor to pull the entire network back to the center"
            springConstant: 0.1,          // "how 'sturdy' the springs are, higher values mean stronger springs"
            springLength: 100,            // "the rest length of the spring"
            damping: 0.1,                 // "how much of the velocity from the previous physics simulation iteration carries over to the next iteration"
            avoidOverlap: 0,              // "if > 0, the size of the node is taken into account"
        },
        repulsion: {
            centralGravity: 0.1,          // "central gravity attractor to pull the entire network back to the center"
            springLength: 100,            // "edges are modelled as springs, [this] is the rest length of the spring"
            springConstant: 0.1,          // "how 'sturdy' the springs are, higher values mean stronger springs"
            nodeDistance: 200,            // "range of influence for the repulsion"
            damping: 0.1,                 // "how much of the velocity from the previous physics simulation iteration carries over to the next iteration"
        },
        barnesHut: {
            theta: 0.5,                    // "higher values are faster but generate more errors, lower values are slower but with less errors"
            gravitationalConstant: -10000, // "the value is negative - if you want the repulsion to be stronger, decrease the value"
            centralGravity: 1,             // "central gravity attractor to pull the entire network back to the center"
            springLength: 100,             // "edges are modelled as springs, [this] is the rest length of the spring"
            springConstant: 0.1,           // "how 'sturdy' the springs are, higher values mean stronger springs"
            damping: 0.1,                  // "how much of the velocity from the previous physics simulation iteration carries over to the next iteration"
            avoidOverlap: 0,               // "if > 0, the size of the node is taken into account"
        },
    },
};
