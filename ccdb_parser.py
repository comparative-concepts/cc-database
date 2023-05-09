
import sys
import re
import yaml
import json
import argparse
from pathlib import Path
from typing import Union, Optional
from datetime import datetime

# A parsed definition is a list of either strings or links (as pairs of strings)
ParsedDefinition = list[Union[str, tuple[str, str]]]

class CCDBParser:
    glosses: dict[str, dict]
    allnames: dict[str, str]
    notfound: set
    errors: int

    def __init__(self):
        self.errors = 0
        self.notfound = set()


    def parse_yaml_database(self, glossfile:Union[str,Path]):
        """Parse a YAML database."""
        with open(glossfile) as F:
            self.glosses = {
                item['Id']: item 
                for item in yaml.load(F, Loader=yaml.CLoader)
            }

        # All possible names (ids and aliases)
        self.allnames = {
            name.casefold(): id 
            for id, item in self.glosses.items() 
            for name in [id] + item['Alias']
        }

        # Sanity check: No alias should be an existing id
        allids = set(id.casefold() for id in self.glosses)
        for item in self.glosses.values():
            for alias in item['Alias']: 
                assert alias.casefold() not in allids, (alias, item)

        # Expand all definitions by converting abbreviated links 
        # "<a>name</a>" and "<a alias>name</a>" into the form "<a id>name</a>"
        for id, item in self.glosses.items():
            definition, links = self.parse_definition(id, item['Definition'])
            item['ParsedDefinition'] = definition
            item['DefinitionLinks'] = links


    def parse_definition(self, id:str, definition:str) -> tuple[ParsedDefinition, list[str]]:
        """Parse a definition and return the expanded definition and the list of links."""
        links = []
        expanded_definition = []
        for part in re.split(r'(<a[^<>]*>.+?</a>)', definition):
            if (m := re.match(r'<a *([^<>]*?)>(.+?)</a>', part)):
                name = m.group(2)
                original_link = m.group(1) or name
                link = self.clean_link(original_link)
                if not link:
                    self.error(f"{id}: Could not clean link '{original_link}'")
                    link = original_link
                if link in self.allnames:
                    linkid = self.allnames[link]
                else:
                    linkid = self.find_closest(link)
                if not linkid:
                    self.error(f"{id}: Could not find any matching id for link '{link}'")
                    self.notfound.add(link)
                    linkid = link
                links.append(linkid)
                part = (linkid, name)
            if part:
                expanded_definition.append(part)
        return expanded_definition, links


    def clean_link(self, link:str) -> Optional[str]:
        """Clean a link by trying some very common English inflection patterns."""
        link = link.casefold()
        link = re.sub(r"[^'a-z/()-]+", ' ', link).strip()
        if not re.search(r'[a-z]', link):
            return None
        if link in self.allnames:
            return link
        # Link is singular, but alias is plural:
        if link[-1] in "sxzh"     and link +'es' in self.allnames:  return link + 'es'
        if link[-1] not in "sxzh" and link + 's' in self.allnames:  return link + 's'
        # Link is plural, but alias is singular:
        if link.endswith('s')     and link[:-1] in self.allnames:   return link[:-1]
        if link.endswith('es')    and link[:-2] in self.allnames:   return link[:-2]
        # Link is genitive:
        if link.endswith("'s")    and link[:-2] in self.allnames:   return link[:-2]
        # Link is perfect tense (and original ends with -e):
        if link.endswith("ed")    and link[:-1] in self.allnames:   return link[:-1]
        # Link is perfect tense (and original doesn't end with -e):
        if link.endswith("ed")    and link[:-2] in self.allnames:   return link[:-2]
        # Link is an adverb:
        if link.endswith("ally")  and link[:-2] in self.allnames:   return link[:-2]
        return link


    def find_closest(self, link:str) -> Optional[str]:
        """Find the closest CC id that a link refers to."""
        for name, id in self.allnames.items():
            if name == link:
                return id
            for idtype, nametypes in self.TYPE_ENDINGS.items():
                for nametype in nametypes:
                    if link.endswith(' '+nametype) and id.endswith(' '+idtype):
                        if name == link[:-len(nametype)].strip():
                            return id
                        if name.endswith(' '+idtype):
                            if name[:-len(idtype)].strip() == link[:-len(nametype)].strip():
                                return id
                        break
        return None

    # Used when finding the closest match of a link
    TYPE_ENDINGS = {
        '[cxn]': ['construction', 'constructions'],
        '[str]': ['strategy', 'strategies', 'category', 'categories'],
        '[inf]': ['construal', 'information packaging', 'referent', 'referents'],
        '[sem]': ['role', 'roles', 'relation', 'relations'],
    }


    def expand_link(self, id:str, name:Optional[str]=None) -> str:
        """Expand an abbreviated link "<a>name</a>" into the form "<a id>name</a>"."""
        if name is None: 
            name = id
        if id in self.glosses:
            return f'<a {id}>{name}</a>'
        else:
            self.notfound.add(id)
            return f'<notfound><a {id}>{name}</a></notfound>'


    @staticmethod
    def uri_friendly_name(name:str) -> str:
        """Make CC names (ids, aliases) URI-friendly."""
        return (name
            .replace('(', '').replace(')', '')
            .replace('[', '(').replace(']', ')')
            .replace('/', '-')
            .replace(' ', '-')
            .replace('---', '-')
            .replace('--', '-')
        )


    @staticmethod
    def html_friendly_name(name:str) -> str:
        """Make CC names (ids, aliases) html-friendly."""
        return (name
            .replace('---', '\u2014') # em-dash
            .replace('--', '\u2013') # en-dash
            .replace('[', '(<i>').replace(']', '</i>)')
        )


    def convert_link_to_html(self, id:str, name:Optional[str]=None) -> str:
        """Convert a CC link into HTML, with an actual link to the CC in the database."""
        if name is None: 
            name = id
        href_id = self.uri_friendly_name(id)
        html_name = self.html_friendly_name(name)
        return f'<a href="#{href_id}">{html_name}</a>'


    def convert_definition_to_html(self, definition:ParsedDefinition) -> str:
        """Convert a CC definition into HTML, with actual links to the CCs in the database."""
        html_parts = []
        for part in definition:
            if isinstance(part, tuple):
                part = self.convert_link_to_html(*part)
            html_parts.append(part)
        return self.clean_definition_html(''.join(html_parts))


    @staticmethod
    def clean_definition_html(definition:str) -> str:
        """Standard HTML conversions."""
        return (definition
            .replace('</a> <a', '</a> <span class="separation"/> <a')
            .replace('<dq>', '<q class="dq">').replace('</dq>', '</q>')
            .replace('<sc>', '<span class="sc">').replace('</sc>', '</span>')
            .replace('<b>', '<strong>').replace('</b>', '</strong>')
            .replace('<i>', '<em>').replace('</i>', '</em>')
            .replace('-->', '&rarr;')
            .replace('& ', '&amp; ').replace('< ', '&lt; ').replace(' >', ' &gt;')
            .replace('---', '\u2014') # em-dash
            .replace('--', '\u2013') # en-dash
        )


    def print_html(self):
        """Print the whole database as a single HTML file (to stdout)."""
        print('<!DOCTYPE html>')
        print('<html><head><meta charset="utf-8"/>')
        print('<script src="mark.min.js"></script>')
        print('<script src="ccdb.js"></script>')
        print('<link rel="stylesheet" href="ccdb.css"/>')
        print('</head><body>')
        print('<div id="search"></div>')
        print(f'<h1><a href="#">Database of Comparative Concepts</a></h1>')
        print(f"<p>Extracted from the appendix of <em>Morphosyntax: Constructions of the World's Languages</em>, by William Croft (2022)")
        print(f'<p><strong>Build date/time:</strong> {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>')

        nlinks = sum(len(item['DefinitionLinks']) for item in self.glosses.values())
        print(f'<p><strong>Statistics:</strong> {len(self.glosses)} CCs, and {nlinks} links within CC definitions</p>')

        print('<div id="glosses">')
        for id in sorted(self.glosses, key=str.casefold):
            item = self.glosses[id]
            print(f'<div class="cc" id="{self.uri_friendly_name(id)}">')
            print(f'<h2 class="name">{self.convert_link_to_html(id)}</h2>')
            print(f'<dl>')
            if (type := item['Type']):
                if type != 'def':
                    types = type.split('/')
                    entries = [self.TYPE_TO_ENTRY.get(t) for t in types]
                    if all(entries):
                        type = ' / '.join(
                            ( self.convert_link_to_html(e, re.sub(r" *\[\w+\] *", "", e)) 
                              if e in self.glosses else e )
                            for e in entries
                        )
                    else:
                        self.error(f"{id}: Type not found: {type}")
                        self.notfound.add(type)
                        type = f'<span class="notfound">{type}</span>'
                print(f'<dt>Type</dt> <dd class="type">{type}</dd>')
            if (aliases := item['Alias']):
                print('<dt>Aliases</dt> <dd class="name">' +
                      ' | '.join(map(self.html_friendly_name, aliases)) +
                      '</dd>')
            if (instanceOf := item['InstanceOf']):
                print('<dt>Instance of</dt> <dd class="relation">' +
                      self.convert_link_to_html(instanceOf) +
                      '</dd>')
            if (subtypeOf := item['SubtypeOf']):
                print(f'<dt>Subtype of</dt> <dd class="relation">' +
                      ' | '.join(map(self.convert_link_to_html, subtypeOf)) +
                      '</dd>')
            if (associatedTo := item['AssociatedTo']):
                print(f'<dt>Associated to</dt> <dd class="relation">' +
                      ' | '.join(map(self.convert_link_to_html, associatedTo)) +
                      '</dd>')
            if (parsedDefinition := item['ParsedDefinition']): 
                print(f'<dt>Definition</dt> <dd class="definition">' +
                      self.convert_definition_to_html(parsedDefinition) +
                      '</dd>')
            print('</dl>')
            print('</div>')
        print('</div>')
        print('</body></html>')

    # What general definitions do different types correspond to?
    TYPE_TO_ENTRY = {
        'cxn': 'construction [def]',
        'str': 'strategy [def]',
        'inf': 'information packaging [def]',
        'sem': 'meaning [def]',
    }


    def convert_definition_to_karp(self, definition:ParsedDefinition) -> str:
        """Convert a CC definition into a Karp-formatted string."""
        karp_parts = []
        for part in definition:
            if isinstance(part, tuple):
                part = f"<a {part[0]}>{part[1]}</a>"
            karp_parts.append(part)
        return ''.join(karp_parts)


    def export_to_karp(self):
        """Export the whole database as a single JSON-lines file for use in Karp (to stdout)."""
        for id in sorted(self.glosses, key=str.casefold):
            item = self.glosses[id]
            out = {}
            for key, outkey in self.KARP_KEYS:
                if (value := item.get(key)):
                    if key == 'ParsedDefinition':
                        value = self.convert_definition_to_karp(value)
                    out[outkey] = value
            print(json.dumps(out))

    # Input/output keys to include in the Karp JSON output
    KARP_KEYS = [
        ('Id', 'Id'),
        ('Type', 'Type'),
        ('Alias', 'Alias'),
        ('InstanceOf', 'InstanceOf'),
        ('SubtypeOf', 'SubtypeOf'),
        ('AssociatedTo', 'AssociatedTo'),
        ('ParsedDefinition', 'Definition'),
    ]


    def export_to_fnbr(self):
        """Export the database to the same JSON format as FrameNet Brazil."""
        # Special cases (e.g., "strategy [def]" is "strategy [str]" in FNBr)
        SPECIAL_FNBR_CCs = {
            id: id.replace('[def]', '['+typ+']')
            for typ, id in self.TYPE_TO_ENTRY.items()
        }
        out_ccs = []
        for id in sorted(self.glosses, key=str.casefold):
            item = self.glosses[id]
            if not (item['Type'] in self.FNBR_TYPES or id in SPECIAL_FNBR_CCs):
                continue
            if any(instance.get('InstanceOf') == id for instance in self.glosses.values()):
                continue
            out = {}
            for key, outkey in self.FNBR_KEYS:
                if outkey == 'associatedTo' and item['Type'] != 'cxn' and (parent := item.get('InstanceOf')):
                    # Find the constructions that are instance-siblings, 
                    # but only if the item itself is not a construction
                    siblings = [
                        sib for sib, sibitem in self.glosses.items() 
                        if sib != id and sibitem.get('InstanceOf') == parent
                        if sibitem.get('Type') == 'cxn'
                    ]
                    item.setdefault(key, []).extend(siblings)

                if (value := item.get(key)):
                    if isinstance(value, str):
                        if outkey != 'definition':
                            # we use "--" in ids, where FNBr uses "-"
                            value = value.replace('--', '-')
                        if outkey == 'id':
                            # Special cases (e.g., "strategy [def]" --> "strategy [str]")
                            value = SPECIAL_FNBR_CCs.get(id, value)
                        elif outkey == 'name': 
                            # The name is the CC id minus the type information
                            value = re.sub(r" *\[[\w/]+\]( +/)?", "", value)
                        elif outkey == 'type':
                            # Special cases (e.g., "strategy" has FNBr type "strategy")
                            if id in SPECIAL_FNBR_CCs:
                                value = re.sub(r" *\[[\w/]+\]( +/)?", "", id)
                            # Convert type names (e.g., "cxn" --> "construction")
                            value = self.FNBR_TYPES.get(value, value)

                    elif isinstance(value, list):
                        # we use "--" in ids, where FNBr uses "-"
                        value = [v.replace('--', '-') for v in value]
                        if outkey == 'subTypeOf':
                            value = [SPECIAL_FNBR_CCs.get(parent, parent) for parent in value]

                    else:
                        self.error(f"{id}: Unknown type for key {key}: {type(value)}")

                    out[outkey] = value

                elif outkey == 'definition':
                    out[outkey] = ""
                    if (parent := item.get('InstanceOf')):
                        if (parent_definition := self.glosses[parent].get('Definition')):
                            out[outkey] = parent_definition
            out_ccs.append(out)
        final_output = {
            'db-version': "export from cc-database",
            'ccs': out_ccs,
        }
        jout = json.dumps(final_output, indent=2)
        print(jout)

    # Keys to include in the FrameNet Brazil output
    FNBR_KEYS = [
        ('Id', 'name'), # The name is the id minus the type information
        ('Definition', 'definition'),
        ('Type', 'type'),
        ('Id', 'id'),
        ('AssociatedTo', 'associatedTo'),
        ('SubtypeOf', 'subTypeOf'),
        # ('Alias', 'alias'), # FNBR doesn't use this
        # ('InstanceOf', 'instanceOf'), # FNBR doesn't use this - instead the siblings are added to associatedTo
    ]

    # What type names does FNBR use?
    FNBR_TYPES = {
        'cxn': 'construction',
        'str': 'strategy',
        'str:fnbr': 'strategy',
        'inf': 'information packaging',
        'inf:fnbr': 'information packaging',
        'sem': 'meaning',
    }


    def error(self, err:str):
        """Report an error."""
        print("** ERROR **", err, file=sys.stderr)
        self.errors += 1


    def error_report(self):
        """Print a final error report."""
        print(f"\n{self.errors} error(s) encountered", file=sys.stderr)
        if self.notfound:
            print(
                f"{len(self.notfound)} CC id(s) not found:\n -",
                "\n - ".join(sorted(self.notfound)), 
                file=sys.stderr
            )


OutputFormats = ['html', 'karp', 'fnbr']

parser = argparse.ArgumentParser(description='Parse the comparative concepts database and export it in different formats.')
parser.add_argument('--format', '-f', choices=OutputFormats, help=f'export format')
parser.add_argument('cc_database', type=Path, help='YAML database of comparative concepts')

if __name__ == '__main__':
    args = parser.parse_args()
    if not args.format:
        print("No output format selected, I will only validate the database.", file=sys.stderr)
    ccdb = CCDBParser()
    ccdb.parse_yaml_database(args.cc_database)
    if args.format == 'html':
        ccdb.print_html()
    elif args.format == 'karp':
        ccdb.export_to_karp()
    elif args.format == 'fnbr':
        ccdb.export_to_fnbr()
    ccdb.error_report()

