
import sys
import re
import yaml
from datetime import datetime

# Used when finding the closest match of a link
TYPES = {
    'construction': '[cxn]',
    'constructions': '[cxn]',
    'strategy': '[str]',
    'strategies': '[str]',
    'category': '[str]',
    'categories': '[str]',
    'construal': '[inf]',
    'information packaging': '[inf]',
    'referent': '[inf]',
    'referents': '[inf]',
    'role': '[sem]',
    'roles': '[sem]',
    'relation': '[sem]',
    'relations': '[sem]',
}

# What general definitions do different types correspond to?
TYPE_TO_ENTRY = {
    'cxn': 'construction [def]',
    'str': 'strategy [def]',
    'inf': 'information packaging [def]',
    'sem': 'meaning [def]',
}

# Read the CC database
_, glossfile = sys.argv
with open(glossfile) as F:
    glosslist = yaml.load(F, Loader=yaml.CLoader)

glosses = {item['Id']: item for item in glosslist}

# Regexp to find links within a CC definition
linkre = re.compile(r'<a *([^>]*?)>(.+?)</a>')

# All possible names, ids and aliases
allnames = {name.casefold(): id for id, item in glosses.items() for name in [id] + item['Alias']}
allids = set(id.casefold() for id in glosses)

# No alias should be an existing ID
for id, item in glosses.items():
    for alias in item['Alias']: 
        assert alias.casefold() not in allids, (alias, item)


# Clean a link by trying some very common English inflection patterns
def clean_link(link):
    link = link.replace("’", "'").casefold()
    link = re.sub(r"[^'a-z/()-]+", ' ', link).strip()
    if not re.search(r'[a-z]', link):
        return None
    if link in allnames:
        return link
    # Link is singular, but alias is plural
    if link[-1] in "sxzh"     and link + 'es' in allnames: return link + 'es'
    if link[-1] not in "sxzh" and link + 's' in allnames:  return link + 's'
    # Link is plural, but alias is singular
    if link.endswith('s')     and link[:-1] in allnames:   return link[:-1]
    if link.endswith('es')    and link[:-2] in allnames:   return link[:-2]
    # Link is genitive
    if link.endswith("'s")    and link[:-2] in allnames:   return link[:-2]
    # Link is perfect tense (and original ends with -e)
    if link.endswith("ed")    and link[:-1] in allnames:   return link[:-1]
    # Link is perfect tense (and original doesn't end with -e)
    if link.endswith("ed")    and link[:-2] in allnames:   return link[:-2]
    # Link is adverb
    if link.endswith("ally")  and link[:-2] in allnames:   return link[:-2]
    return link


# Find the closest CC id that a link refers to
def find_closest(link):
    for name, id in allnames.items():
        if name == link:
            return id
        for nametype, idtype in TYPES.items():
            if link.endswith(' '+nametype) and id.endswith(' '+idtype):
                if name == link[:-len(nametype)].strip():
                    return id
                if name.endswith(' '+idtype):
                    if name[:-len(idtype)].strip() == link[:-len(nametype)].strip():
                        return id
                break
    print(f"*** ERROR ***  Can't find link '{link}'", file=sys.stderr)


# Transform CC definitions into nicely formatted HTML
def collect_deflinks():
    for item in glosses.values():
        defn = item['Definition']
        item['Links'] = []
        prdef = ""
        for part in re.split(r'(<a[^>]*>.+?</a>)', defn):
            m = linkre.match(part)
            if not m: 
                prdef += part
                continue
            origlink = (m.group(1) or m.group(2))
            link = clean_link(origlink)
            assert link, (origlink, item)
            if link in allnames:
                linkid = allnames[link]
            else:
                linkid = find_closest(link)
            prdef += plink(linkid, m.group(2))
            item['Links'].append(linkid)
        prdef = (prdef
            .replace('</a> <a', '</a> <span class="separation"/> <a')
            .replace('<dq>', '<q class="dq">').replace('</dq>', '</q>')
            .replace('<sc>', '<span class="sc">').replace('</sc>', '</span>')
            .replace('<b>', '<strong>').replace('</b>', '</strong>')
            .replace('<i>', '<em>').replace('</i>', '</em>')
            .replace('-->', '&rarr;')
            .replace('& ', '&amp; ').replace('< ', '&lt; ').replace(' >', ' &gt;')
            .replace('--', '–')
        )
        item['PrintDefinition'] = prdef


# Very simple CSS for the HTML database
CSS = """
body {margin: 20px; font-family: Georgia, serif}
dt {float: left; clear: left; width: 8em; font-weight: bold; margin-bottom: 5px}
dd {margin-left: 8em; margin-top: 5px}
.notfound {color: red}
.sc {font-variant: small-caps}
q {quotes: "‘" "’"}
q.dq {quotes: "“" "”"}
.separation::before {content: " · "}
"""


# Make CC id's URI-friendly
def idstr(id):
    return (id
        .replace('(', '').replace(')', '')
        .replace('[', '(').replace(']', ')')
        .replace('/', '-')
        .replace(' ', '-')
        .replace('---', '-')
        .replace('--', '-')
    )


# Make CC id's printing-friendly
def namestr(name):
    return (name
        .replace('--', '–')
        .replace('[', '(<i>').replace(']', '</i>)')
    )


# Show a CC link in HTML, with an actual link to the CC in the database
def plink(id, name=None):
    if name is None: name = id
    if id not in glosses:
        global notfound_links
        notfound_links.add(id)
        return f'<span class="notfound">{namestr(name)}</span>'
    title = id
    defin = glosses[id]["Definition"].strip()
    if not defin and glosses[id]["InstanceOf"]:
        title += " ⟹ " + glosses[id]["InstanceOf"]
        defin = glosses[glosses[id]["InstanceOf"]]["Definition"].strip()
    if defin:
        title += "\n\n" + re.sub(r"<.*?>", "", defin)
    return f'<a href="#{idstr(id)}" title="{title}">{namestr(name)}</a>'


# Print the whole database as a single HTML file
def print_html():
    print('<!DOCTYPE html>')
    print(f'<html><head><meta charset="utf-8"/><style>{CSS}</style></head><body>')
    print(f'<h1><a href="#">Database of Comparative Concepts</a></h1>')
    print(f"<p>Extracted from the appendix of <em>Morphosyntax: Constructions of the World's Languages</em>, by William Croft (2022)")
    print(f'<p><strong>Build date/time:</strong> {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>')

    nlinks = sum(len(item['Links']) for item in glosses.values())
    print(f'<p><strong>Statistics:</strong> {len(glosses)} CCs, and {nlinks} links within CC definitions</p>')

    for id, item in sorted(glosses.items(), key=lambda x: str.casefold(x[0])):
        print(f'<div class="definition">')
        print(f'<h2 id="{idstr(id)}"><a href="#{idstr(id)}"">{namestr(id)}</a></h2>')
        print(f'<dl>')
        typ = item['Type']
        types = typ.split('/')
        entries = [TYPE_TO_ENTRY.get(t) for t in types]
        if typ == 'def':
            print(f'<dt>Type</dt> <dd>{typ}</dd>')
        elif not all(entries):
            notfound_links.add(typ)
            print(f'<dt>Type</dt> <dd class="notfound">{typ}</dd>')
        else:
            entrylinks = [
                plink(e, t) if e in glosses else e
                for e, t in zip(entries, types)
            ]
            print(f'<dt>Type</dt> <dd>{" / ".join(entrylinks)}</dd>')
        if item['Alias']: print(f"<dt>Aliases</dt> <dd>{' | '.join(namestr(n) for n in item['Alias'])}</dd>")
        if item['InstanceOf']: print(f"<dt>Instance of</dt> <dd>{plink(item['InstanceOf'])}</dd>")
        if item['SubtypeOf']: print(f"<dt>Subtype of</dt> <dd>{' | '.join(plink(i) for i in item['SubtypeOf'])}</dd>")
        if item['AssociatedTo']: print(f"<dt>Associated to</dt> <dd>{' | '.join(plink(i) for i in item['AssociatedTo'])}</dd>")
        if item["PrintDefinition"]: print(f'<dt>Definition</dt> <dd>{item["PrintDefinition"]}</dd>')
        print('</dl>')
        print('</div>')

    print('</body></html>')


# Here we collect all CC's and other terms that are not found in the database
notfound_links = set()


# Build HTML code for each of the CC definitions
collect_deflinks()
print_html()


# Print the CC id's that were not found in the database
if notfound_links:
    print(
        f"# {len(notfound_links)} ID's not found:\n -",
        "\n - ".join(sorted(notfound_links)), 
        file=sys.stderr
    )
