
window.addEventListener('DOMContentLoaded', initialize);

function initialize() {
    init_linktitles();
    init_searchfilter();
}

///////////////////////////////////////////////////////////////////////////////
// Show preview when hovering over links

function init_linktitles() {
    for (const elem of document.getElementsByTagName('a')) {
        elem.addEventListener('mouseover', set_link_title);
    }
}

function set_link_title(event) {
    const anchor = event.target;
    while (anchor && anchor.href) {
        const linked_id = anchor.href.replace(/^.*#/, '');
        const linked_elem = document.getElementById(linked_id);
        if (!linked_elem) return;
        const linked_name = linked_elem.querySelector('h2');
        const linked_definition = linked_elem.querySelector('.definition');
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
const TYPE = {}
const SEARCH = {};
const ALL_CCS = [];

function init_searchfilter() {
    for (const elem of document.getElementsByClassName('cc')) {
        const cc = {elem: elem};
        for (const type of FILTER_TYPES.concat('type')) {
            const splitchar = type === 'definition' ? '#' : '|';
            const content = merge_cc_elements(splitchar, elem.getElementsByClassName(type));
            cc[type] = content;
        }
        ALL_CCS.push(cc);
    }

    const checkboxes_types = CC_TYPES.map((type, i) =>
        `${i && i % 3 == 0 ? '<br/>' : ''}
        <label><input id="type-${type.replace(' ', '-')}" type="checkbox" checked/> ${type}</label>`
    );

    const checkboxes_filters = FILTER_TYPES.map((type, i) =>
        `<label><input id="search-${type}" type="checkbox" ${i===0 ? 'checked' : ''}/> ${type}</label>`
    );

    const radioboxes = MATCH_TYPES.map((type, i) =>
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

    for (const key of CC_TYPES) {
        TYPE[key] = document.getElementById('type-' + key.replace(' ', '-'));
    }
    for (const key of FILTER_TYPES.concat(['box', 'info'])) {
        SEARCH[key] = document.getElementById('search-' + key);
    }

    for (const elem of document.getElementsByTagName('a')) {
        elem.addEventListener('click', () => setTimeout(filter_ccs, 100));
    }
    for (const elem of document.getElementById('search').getElementsByTagName('input')) {
        elem.addEventListener('input', filter_ccs);
    }
    filter_ccs();
}

function merge_cc_elements(splitchar, elemlist) {
    names = [];
    for (const elem of elemlist) {
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
    const glosses = document.getElementById('glosses');
    new Mark(glosses).unmark();

    const current_id = window.location.href.replace(/^.*#/, '');
    const current_elem = document.getElementById(current_id);
    if (current_elem) {
        const current_name = current_elem.querySelector('.name');
        new Mark(current_name).markRanges([{
            start: 0, length: current_name.innerText.length,
        }]);
    }

    // Define search variables, based on current search term
    // We only care about alphanumeric characters
    const search_term = SEARCH['box'].value.trim().replace(/\W+/g, ' ');
    let is_search, regex, filter_types;

    if (search_term.length < 3) {
        is_search = false;
        regex = null;
        filter_types = null;

        for (const cc of ALL_CCS) {
            cc.elem.style.display = '';
        }
        SEARCH['info'].innerText = `Type at least 3 characters`;
    } else {
        is_search = true;
        const checked_radio = document.querySelector('input[name="matchtype"]:checked');
        const match_type = checked_radio ? checked_radio.value : 'contains';
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
    const all_cc_types = new Set(CC_TYPES);
    const cc_types = new Set(CC_TYPES.filter((type) => TYPE[type].checked));

    let count = 0;

    for (const cc of ALL_CCS) {
        const is_current = (cc.elem.id === current_id);
        let show;

        if (all_cc_types.has(cc.type)) {
            show = cc_types.has(cc.type);
        } else {
            show = cc_types.has('other');
        }

        if (show && is_search) {
            show = false;
            for (const type of filter_types) {
                if (regex.test(cc[type])) {
                    show = true;
                    break;
                }
            }
        }

        if (show || is_current) {
            cc.elem.style.display = '';
            count++;

            if (is_search) {
                for (const type of filter_types) {
                    const contents = cc.elem.querySelectorAll('.' + type);
                    new Mark(contents).markRegExp(regex, {acrossElements: true});
                }
            }
        } else {
            cc.elem.style.display = 'none';
        }
    }

    if (count < ALL_CCS.length) {
        SEARCH['info'].innerText = `${is_search ? 'Found' : 'Showing '} ${count} CCs (out of ${ALL_CCS.length})`;
    }

    SEARCH['box'].focus();
    if (current_elem) current_elem.scrollIntoView();
}
