
window.addEventListener('DOMContentLoaded', initialize);

function initialize() {
    init_linktitles();
    init_searchfilter();
}

///////////////////////////////////////////////////////////////////////////////
// Show preview when hovering over links

function init_linktitles() {
    for (let elem of document.getElementsByTagName('a')) {
        elem.addEventListener('mouseover', set_link_title);
    }
}

function set_link_title(event) {
    let anchor = event.target;
    while (anchor && anchor.href) {
        let linked_id = anchor.href.replace(/^.*#/, '');
        let linked_elem = document.getElementById(linked_id);
        if (!linked_elem) return;
        let linked_name = linked_elem.querySelector('h2');
        let linked_definition = linked_elem.querySelector('.definition');
        if (linked_definition) {
            event.target.title = linked_name.innerText.trim() + '\n\n' + linked_definition.innerText.trim();
            return;
        }
        anchor = linked_elem.querySelector('.instanceof a');
    }
}

///////////////////////////////////////////////////////////////////////////////
// Searching/filtering CCs

const CC_TYPES = ['construction', 'strategy', 'meaning', 'information packaging', 'definition', 'other']
const FILTER_TYPES = ['name', 'relation', 'definition'];
const MATCH_TYPES = ['contains', 'starts with', 'words start with']
var TYPE = {}
var SEARCH = {};
var ALL_CCS = [];

function init_searchfilter() {
    for (let elem of document.getElementsByClassName('cc')) {
        let cc = {elem: elem};
        for (let type of FILTER_TYPES.concat('type')) {
            let splitchar = type === 'definition' ? '#' : '|';
            let content = merge_cc_elements(splitchar, elem.getElementsByClassName(type));
            cc[type] = content;
        }
        ALL_CCS.push(cc);
    }

    let checkboxes_types = CC_TYPES.map((type, i) =>
        `${i && i % 3 == 0 ? '<br/>' : ''}
        <label><input id="type-${type.replace(' ', '-')}" type="checkbox" checked/> ${type}</label>`
    );

    let checkboxes_filters = FILTER_TYPES.map((type, i) =>
        `<label><input id="search-${type}" type="checkbox" ${i===0 ? 'checked' : ''}/> ${type}</label>`
    );

    let radioboxes = MATCH_TYPES.map((type, i) =>
        `<label><input name="matchtype" type="radio" value="${type}" ${i===0 ? 'checked' : ''}/> ${type}</label>`
    );

    document.getElementById('search').innerHTML = `
        <details><summary>🔎</summary>
        <div>${checkboxes_types.join('\n')}</div>
        <div>Find a ${checkboxes_filters.join('\n')}<br/>
        that ${radioboxes.join('\n')}</div>
        <div><input id="search-box" type="search"/></div>
        <div id="search-info"></div></details>
    `.trim();

    for (let key of CC_TYPES) {
        TYPE[key] = document.getElementById('type-' + key.replace(' ', '-'));
    }
    for (let key of FILTER_TYPES.concat(['box', 'info'])) {
        SEARCH[key] = document.getElementById('search-' + key);
    }

    for (let elem of document.getElementsByTagName('a')) {
        elem.addEventListener('click', () => setTimeout(filter_ccs, 100));
    }
    for (let elem of document.getElementById('search').getElementsByTagName('input')) {
        elem.addEventListener('input', filter_ccs);
    }
    filter_ccs();
}

function merge_cc_elements(splitchar, elemlist) {
    names = [];
    for (let elem of elemlist) {
        if (elem && elem.innerText) {
            for (let n of elem.innerText.split(splitchar)) {
                n = n.trim();
                if (n) names.push(n);
            }
        }
    }
    return names.join('#');  // '#' doesn't occur in the CC database
}

function filter_ccs() {
    var glosses = document.getElementById('glosses');
    new Mark(glosses).unmark();

    let current_id = window.location.href.replace(/^.*#/, '');
    let current_elem = document.getElementById(current_id);
    if (current_elem) {
        let current_name = current_elem.querySelector('.name');
        new Mark(current_name).markRanges([{
            start: 0, length: current_name.innerText.length,
        }]);
    }

    // Define search variables, based on current search term
    let search_term = SEARCH['box'].value;
    // We only care about alphanumeric characters
    search_term = search_term.trim().replace(/\W+/g, ' ');
    let is_search, regex, filter_types;

    if (search_term.length < 3) {
        is_search = false;
        regex = null;
        filter_types = null;

        for (let cc of ALL_CCS) {
            cc['elem'].style.display = '';
        }
        SEARCH['info'].innerText = `Type at least 3 characters`;
    } else {
        is_search = true;
        let checked_radio = document.querySelector('input[name="matchtype"]:checked');
        let match_type = checked_radio ? checked_radio.value : 'contains';
        let regex_str = search_term;
        if (match_type !== 'contains') {
            // Each search term must start a word
            regex_str = search_term.replaceAll(' ', ' \\b');
            // The first search term must either start the text or just a word
            regex_str = (match_type==='starts with' ? '^' : '\\b') + regex_str;
        }
        // '#' is the separator used by `merge_cc_elements` above, so we don't want to accept that
        regex_str = regex_str.replaceAll(' ', '[^#]*?');
        regex = new RegExp(regex_str, 'i');
        filter_types = FILTER_TYPES.filter((type) => SEARCH[type].checked);
    }

    // Set CC types to be filtered
    let all_cc_types = new Set(CC_TYPES);
    let cc_types = new Set(CC_TYPES.filter((type) => TYPE[type].checked));

    let count = 0;

    for (let cc of ALL_CCS) {
        let elem = cc['elem'];
        let type = cc['type'];
        let is_current = (elem.id === current_id);
        let show;

        if (all_cc_types.has(type)) {
            show = cc_types.has(type);
        } else {
            show = cc_types.has('other');
        }

        if (show && is_search) {
            show = false;
            for (let type of filter_types) {
                if (regex.test(cc[type])) {
                    show = true;
                    break;
                }
            }
        }

        if (show || is_current) {
            elem.style.display = '';
            count++;

            if (is_search) {
                for (let type of filter_types) {
                    let contents = elem.querySelectorAll('.' + type);
                    new Mark(contents).markRegExp(regex, {acrossElements: true});
                }
            }
        } else {
            elem.style.display = 'none';
            console.log(cc);
        }
    }

    if (count < ALL_CCS.length) {
        SEARCH['info'].innerText = `${is_search ? 'Found' : 'Showing '} ${count} CCs (out of ${ALL_CCS.length})`;
    }

    SEARCH['box'].focus();
    if (current_elem) current_elem.scrollIntoView();
}
