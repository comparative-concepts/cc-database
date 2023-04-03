
import sys
import re
# import json
import yaml
from datetime import datetime


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


_, glossfile = sys.argv
with open(glossfile) as F:
    glosslist = yaml.load(F, Loader=yaml.CLoader)

glosses = {item['Id']: item for item in glosslist}


linkre = re.compile(r'<a *([^>]*?)>(.+?)</a>')

allnames = {name.casefold(): id for id, item in glosses.items() for name in [id] + item['Alias']}
allids = set(id.casefold() for id in glosses)

for id, item in glosses.items():
    for alias in item['Alias']: 
        assert alias.casefold() not in allids, (alias, item)


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


# Create URI-friendly id's
def idstr(id):
    return (id
        .replace('(', '').replace(')', '')
        .replace('[', '(').replace(']', ')')
        .replace('/', '-')
        .replace(' ', '-')
        .replace('---', '-')
        .replace('--', '-')
    )

# Make id's printing-friendly
def namestr(name):
    return (name
        .replace('--', '–')
        .replace('[', '(<i>').replace(']', '</i>)')
    )

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
        if item['Alias']: print(f"<dt>Aliases</dt> <dd>{' | '.join(namestr(n) for n in item['Alias'])}</dd>")
        if item['InstanceOf']: print(f"<dt>Instance of</dt> <dd>{plink(item['InstanceOf'])}</dd>")
        if item['SubtypeOf']: print(f"<dt>Subtype of</dt> <dd>{' | '.join(plink(i) for i in item['SubtypeOf'])}</dd>")
        if item['AssociatedTo']: print(f"<dt>Associated to</dt> <dd>{' | '.join(plink(i) for i in item['AssociatedTo'])}</dd>")
        if item["PrintDefinition"]: print(f'<dt>Definition</dt> <dd>{item["PrintDefinition"]}</dd>')
        print('</dl>')
        print('</div>')

    print('</body></html>')


notfound_links = set()

collect_deflinks()
print_html()

if notfound_links:
    print(
        f"# {len(notfound_links)} ID's not found:\n -",
        "\n - ".join(sorted(notfound_links)), 
        file=sys.stderr
    )
