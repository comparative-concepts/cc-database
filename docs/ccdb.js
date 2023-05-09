
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

const FILTER_TYPES = ['name', 'relation', 'definition'];
var SEARCH = {};
var ALL_CCS = [];

function init_searchfilter() {
    for (let elem of document.getElementsByClassName('cc')) {
        let cc = {elem: elem};
        for (let type of FILTER_TYPES) {
            let splitchar = type === 'definition' ? '#' : '|';
            let content = merge_cc_elements(splitchar, elem.getElementsByClassName(type));
            cc[type] = content;
        }
        ALL_CCS.push(cc); 
    }

    let checkboxes = FILTER_TYPES.map((type) =>
        `<label><input id="search-${type}" type="checkbox" ${type=='name' ? 'checked' : ''}/> ${type}</label>`
    );

    document.getElementById('search').innerHTML = `
        ${checkboxes.join('\n')} <br/>
        <input id="search-box" type="search"/> <br/>
        <span id="search-info"></span>
    `.trim();
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
    return names.join('#');  // # doesn't occur in the CC database
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

    let search_term = SEARCH['box'].value;
    search_term = search_term.trim().replace(/ +/g, ' ');
    if (search_term.length < 3) {
        for (let cc of ALL_CCS) {
            cc['elem'].style.display = '';
        }
        SEARCH['info'].innerText = `Type at least 3 characters`;
    }

    else {
        let regex_str = search_term.replaceAll(' ', '[^#]*?');  // # is the separator used by `merge_names` above
        let regex = new RegExp(regex_str, 'i');
        let filter_types = FILTER_TYPES.filter((type) => SEARCH[type].checked);
        let count = 0;
        for (let cc of ALL_CCS) {
            let elem = cc['elem'];
            let show = (elem.id === current_id);
            if (!show) {
                for (let type of filter_types) {
                    if (regex.test(cc[type])) {
                        show = true;
                        break;
                    }
                }
            }
            if (show) {
                elem.style.display = '';
                for (let type of filter_types) {
                    let contents = elem.querySelectorAll('.' + type);
                    new Mark(contents).markRegExp(regex, {acrossElements: (type === 'definition')});
                }
                count++;
            } else {
                elem.style.display = 'none';
            }
        }
        SEARCH['info'].innerText = `Found ${count} CCs (out of ${ALL_CCS.length})`;
    }

    SEARCH['box'].focus();
    if (current_elem) current_elem.scrollIntoView();
}
