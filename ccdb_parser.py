
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


    def convert_link_to_html(self, id:str, name:Optional[str]=None, showtitle:bool=True) -> str:
        """Convert a CC link into HTML, with an actual link to the CC in the database."""
        if name is None: 
            name = id
        href_id = self.uri_friendly_name(id)
        html_name = self.html_friendly_name(name)
        if showtitle:
            title = id
            definition = self.glosses[id]["Definition"].strip()
            while not definition and (parent := self.glosses[id]["InstanceOf"]):
                title += " ⟹ " + parent
                definition = self.glosses[parent]["Definition"].strip()
            if definition:
                title += "\n\n" + re.sub(r"<[^<>]+>", "", definition)
            return f'<a href="#{href_id}" title="{title}">{html_name}</a>'
        else:
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
        print(f'<html><head><meta charset="utf-8"/><style>{self.CSS}</style></head><body>')
        print(f'<h1><a href="#">Database of Comparative Concepts</a></h1>')
        print(f"<p>Extracted from the appendix of <em>Morphosyntax: Constructions of the World's Languages</em>, by William Croft (2022)")
        print(f'<p><strong>Build date/time:</strong> {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>')

        nlinks = sum(len(item['DefinitionLinks']) for item in self.glosses.values())
        print(f'<p><strong>Statistics:</strong> {len(self.glosses)} CCs, and {nlinks} links within CC definitions</p>')

        for id in sorted(self.glosses, key=str.casefold):
            item = self.glosses[id]
            print(f'<div class="definition">')
            print(f'<h2 id="{self.uri_friendly_name(id)}">{self.convert_link_to_html(id, showtitle=False)}</h2>')
            print(f'<dl>')
            type = item['Type']
            if type != 'def':
                types = type.split('/')
                entries = [self.TYPE_TO_ENTRY.get(t) for t in types]
                if all(entries):
                    entrylinks = [
                        self.convert_link_to_html(e, t) if e in self.glosses else e
                        for e, t in zip(entries, types)
                    ]
                    type = ' / '.join(entrylinks)
                else:
                    self.error(f"{id}: Type not found: {type}")
                    self.notfound.add(type)
                    type = f'<span class="notfound">{type}</span>'
            print(f'<dt>Type</dt> <dd>{type}</dd>')
            if item['Alias']: print(f"<dt>Aliases</dt> <dd>{' | '.join(self.html_friendly_name(n) for n in item['Alias'])}</dd>")
            if item['InstanceOf']: print(f"<dt>Instance of</dt> <dd>{self.convert_link_to_html(item['InstanceOf'])}</dd>")
            if item['SubtypeOf']: print(f"<dt>Subtype of</dt> <dd>{' | '.join(self.convert_link_to_html(i) for i in item['SubtypeOf'])}</dd>")
            if item['AssociatedTo']: print(f"<dt>Associated to</dt> <dd>{' | '.join(self.convert_link_to_html(i) for i in item['AssociatedTo'])}</dd>")
            if item['ParsedDefinition']: print(f"<dt>Definition</dt> <dd>{self.convert_definition_to_html(item['ParsedDefinition'])}</dd>")
            print('</dl>')
            print('</div>')

        print('</body></html>')

    # Simple CSS for the HTML database
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


OutputFormats = ['html', 'karp']

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
    ccdb.error_report()

