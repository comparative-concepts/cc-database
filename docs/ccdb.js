
window.addEventListener('DOMContentLoaded', initialize);

var all_ccs = [];

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

function init_searchfilter() {
    for (let cc of document.getElementsByClassName('cc')) {
        let name = merge_cc_elements('|', [
            cc.querySelector('.name'),
            cc.querySelector('.aliases'),
        ]);
        let relation = merge_cc_elements('|', [
            cc.querySelector('.instanceof'),
            cc.querySelector('.subtypeof'),
            cc.querySelector('.associatedto'),
        ]);
        let definition = merge_cc_elements('#', [
            cc.querySelector('.definition'),
        ]);
        all_ccs.push({
            'elem': cc,
            'name': name,
            'relation': relation,
            'definition': definition,
        })
    }

    let checkboxes = FILTER_TYPES.map((type) =>
        `<label><input id="search-${type}" type="checkbox" ${type=='name' ? 'checked' : ''}/> ${type}</label>`
    );

    document.getElementById('search').innerHTML = `
        ${checkboxes.join('\n')} <br/>
        <input id="search-box" type="search"/> <br/>
        Found <span id="search-info"></span> CCs (out of ${all_ccs.length})
    `.trim();

    for (let elem of document.getElementsByTagName('a')) {
        elem.addEventListener('click', () => setTimeout(filter_ccs, 100));
    }
    for (let elem of document.getElementById('search').querySelectorAll('input')) {
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
    let current_id = window.location.href.replace(/^.*#/, '');
    let search_term = document.getElementById('search-box').value;
    let regex_str = search_term.replaceAll(' ', '[^#]*');  // # is the separator used by `merge_names` above
    let regex = new RegExp(regex_str, 'i');
    let filter_types = FILTER_TYPES.filter((type) =>
        document.getElementById('search-'+type).checked
    );
    let count = 0;
    for (let cc of all_ccs) {
        let show = (cc['elem'].id === current_id);
        if (!show) {
            for (let type of filter_types) {
                if (regex.test(cc[type])) {
                    show = true;
                    break;
                }
            }
        }
        cc['elem'].style.display = show ? '' : 'none';
        if (show) count++;
    }
    document.getElementById('search-info').innerText = count;
    document.getElementById('search-box').focus();
}