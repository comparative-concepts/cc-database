
import sys
import re
import json
import argparse
from pathlib import Path
from datetime import datetime

import validation
from validation import CCType, Relation, Glosses, Example, error


# A parsed definition is a list of either strings or links (as pairs of strings)
ParsedDefinition = list[str | tuple[str, str]]

# The different formats that we can export the database to
OutputFormats = ['json', 'fnbr']


class CCDB:
    glosses: Glosses
    version: str
    allnames: dict[str, tuple[str,...]]
    definitions: dict[str, ParsedDefinition]
    links: dict[str, list[str]]

    def __init__(self, glosses: Glosses, version: str) -> None:
        self.glosses = glosses
        self.version = version

        # All possible names (ids and aliases)
        allnames: dict[str, set[str]] = {}
        for id, item in self.glosses.items():
            for name in [id, item.Name] + item.Alias:
                allnames.setdefault(name.casefold(), set()).add(id)
        self.allnames = {name: tuple(ids) for name, ids in allnames.items()}

        # Expand all definitions by converting abbreviated links
        # "<a>name</a>" and "<a alias>name</a>" into the form "<a id>name</a>"
        self.definitions = {}
        self.links = {}
        for id, item in self.glosses.items():
            defn, links = self.parse_definition(id, item.Definition)
            if defn: self.definitions[id] = defn
            if links: self.links[id] = links


    def export(self, args: argparse.Namespace) -> None:
        format = args.format
        if format == "json":
            self.export_to_json(args)
        elif format == "fnbr":
            self.export_to_fnbr()


    ###########################################################################
    ## Parsing definitions

    def parse_definition(self, id: str, definition: str) -> tuple[ParsedDefinition, list[str]]:
        """Parse a definition and return the expanded definition and the list of links."""
        expanded: ParsedDefinition = []
        links: list[str] = []
        for part in re.split(r'(<a[^<>]*>.+?</a>)', definition):
            if (m := re.match(r'<a *([^<>]*?)>(.+?)</a>', part)):
                link_ref = m.group(1)
                name = m.group(2)

                linkids: tuple[str, ...]
                if link_ref:
                    link = link_ref
                    linkids = (link,)
                else:
                    link = self.clean_link(name)
                    if not link:
                        error(id, f"Could not clean link '{name}'")
                        link = name
                    linkids = self.find_closest(link)

                if not linkids:
                    error(id, f"Could not find any matching id for link '{link}'")
                    linkid = link
                else:
                    linkid = linkids[0]
                    if len(linkids) > 1:
                        error(id, f"Ambiguous link '{link}', maps to any of {linkids}")
                links.append(linkid)
                part = (linkid, name)
            else:
                # Test that all <x> are matched
                testpart = part
                nsubs = 1
                while nsubs > 0:
                    (testpart, nsubs) = re.subn(r"<(\w+)>[^<>]+</\1>", "...", testpart)
                if (m := re.search(r"<\w+>", testpart)):
                    error(id, f"Unmatched {m.group()} in definition: {testpart}")
            if part:
                expanded.append(part)
        return expanded, links


    def clean_link(self, link: str) -> str | None:
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


    def find_closest(self, link: str) -> tuple[str, ...]:
        """Find the closest CC ids that a link refers to."""
        if link in self.allnames:
            return self.allnames[link]
        for name, ids in self.allnames.items():
            for id in ids:
                idtype, _, _ = id.partition(":")
                for nametype in self.TYPE_ENDINGS[idtype]:
                    if link.endswith(' '+nametype) and id.startswith(idtype+':'):
                        linkname = link[:-len(nametype)].strip()
                        if name == linkname:
                            return (id,)
                        break
        return ()

    # Used when finding the closest match of a link
    TYPE_ENDINGS: dict[str, list[str]] = {
        'cxn': ['construction', 'constructions'],
        'str': ['strategy', 'strategies', 'category', 'categories'],
        'inf': ['construal', 'information packaging', 'referent', 'referents'],
        'sem': ['role', 'roles', 'relation', 'relations'],
        'def': [],
    }


    ###########################################################################
    ## Convert to HTML or plain text

    @staticmethod
    def convert_name(name: str, type: str = "", html: bool = True) -> str:
        """Make CC names (ids, aliases) html- or text-friendly."""
        name = name.replace('---', '\u2014') # em-dash
        name = name.replace('--', '\u2013') # en-dash
        if not type:
            return name
        elif html:
            return f"{name} (<i>{type}</i>)"
        else:
            return f"{name} ({type})"


    def convert_link(self, id: str, name: str|None = None, selfid: str|None = None, html: bool = True) -> str:
        """Convert a CC link into plain text, or HTML with an actual link to the CC in the database."""
        if name is None:
            item = self.glosses[id]
            name = self.convert_name(item.Name, getattr(item.Type, 'value', ''), html=html)
        else:
            name = self.convert_name(name, html=html)
        if not html:
            return name
        elif id == selfid:
            return f'<strong>{name}</strong>'
        else:
            return f'<a href="#{id}">{name}</a>'


    def convert_definition(self, definition: ParsedDefinition, html: bool = True) -> str:
        """Convert a CC definition into plain text, or HTML with actual links to the CCs in the database."""
        parts: list[str] = []
        for part in definition:
            if isinstance(part, tuple):
                part = self.convert_link(*part, html=html)
            parts.append(part)
        return "".join(parts)


    @staticmethod
    def clean_text(text: str, html: bool = True) -> str:
        if html:
            return (text
                .replace('</a> <a', '</a> <span class="separation"/> <a')
                .replace('<dq>', '<q class="dq">').replace('</dq>', '</q>')
                .replace('<sc>', '<span class="sc">').replace('</sc>', '</span>')
                .replace('<b>', '<strong>').replace('</b>', '</strong>')
                .replace('<i>', '<em>').replace('</i>', '</em>')
                .replace('<e>', '<em>').replace('</e>', '</em>')
                .replace('-->', '&rarr;')
                .replace('& ', '&amp; ').replace('< ', '&lt; ').replace(' >', ' &gt;')
                .replace('---', '\u2014') # em-dash
                .replace('--', '\u2013') # en-dash
            )
        else:
            return re.sub(r"</?\w[^<>]+>", "", text
                .replace('-->', '\u2192') # rightwards arrow
                .replace('---', '\u2014') # em-dash
                .replace('--', '\u2013') # en-dash
            )

    @classmethod
    def clean_object(cls, obj: object, html: bool = True) -> object:
        """Standard HTML/text conversions."""
        if isinstance(obj, str):
            return cls.clean_text(obj, html=html)
        if isinstance(obj, (list, tuple, set)):
            return type(obj)(cls.clean_object(x) for x in obj)  # type: ignore
        if isinstance(obj, dict):
            return {key: cls.clean_object(value, html=html) for key, value in obj.items()}  # type: ignore
        return obj


    ###########################################################################
    ## Export to JSON or Javascript objects

    def export_to_json(self, args: argparse.Namespace) -> None:
        nodes: list[dict[str, object]] = []
        edges: list[dict[str, object]] = []
        for item in self.glosses.values():
            node: dict[str, object] = {}
            if "all" in args.keys:
                args.keys = list(key for key, _ in item if key != "Relations")
            for key in args.keys:
                value = getattr(item, key)
                if key == "Definition" and item.Id in self.definitions:
                    value = self.convert_definition(self.definitions[item.Id], html=args.html)
                if key == "Examples":
                    value = [
                        (ex.__dict__ if isinstance(ex, Example) else ex)
                        for ex in value
                    ]
                if key == "FromGlossary":
                    if not value:
                        node["notOriginal"] = True
                elif value:
                    node[key.lower()] = self.clean_object(value, html=args.html)
            nodes.append(node)
            if "all" in args.relations:
                args.relations = list(Relation)
            for rel in args.relations:
                for target in item.Relations.get(Relation(rel), []):
                    edges.append({
                        "start": target,
                        "end": item.Id,
                        "rel": rel,
                    })
        nodes.sort(key=lambda n: str(n['id']))
        edges.sort(key=lambda e: (e['start'], e['end'], e['rel']))
        data: dict[str, object] = {
            "version": self.version,
            "builddate": datetime.now().strftime("%Y-%m-%d, %H:%M:%S"),
        }
        if nodes:
            data["nodes"] = nodes
        if edges:
            data["edges"] = edges
        self.print_json(data, args)


    @staticmethod
    def print_json(data: dict[str, object], args: argparse.Namespace):
        if args.js_object:
            print(f"var {args.js_object} = ", end="")
        if args.compact:
            print(json.dumps(data), end="")
        else:
            print("{")
            for key, value in data.items():
                if isinstance(value, list):
                    print(f"    {json.dumps(key)}: [")
                    for v in value:  # type: ignore
                        print(f"        {json.dumps(v)},")
                    print("    ],")
                else:
                    print(f"    {json.dumps(key)}: {json.dumps(value)},")
            print("}", end="")
        print(";" if args.js_object else "")


    ###########################################################################
    ## Export to FrameNet Brazil JSON format

    def export_to_fnbr(self) -> None:
        """Export the database to the same JSON format as FrameNet Brazil."""
        # Special cases (e.g., "strategy [def]" is "strategy [str]" in FNBr)
        SPECIAL_FNBR_CCs = {
            id: id.replace('def:', typ.value + ':')
            for typ, id in validation.GENERIC_TYPES.items()
        }
        out_ccs: list[dict[str, object]] = []
        for id in sorted(self.glosses, key=str.casefold):
            item = self.glosses[id]
            if not (item.Type in self.FNBR_TYPES or id in SPECIAL_FNBR_CCs):
                continue
            out: dict[str, object] = {
                'id': SPECIAL_FNBR_CCs.get(item.Id, item.Id),
                'name': item.Name,
                'type': self.FNBR_TYPES.get(item.Type, item.Type),
                'definition': item.Definition,
                'subTypeOf': [SPECIAL_FNBR_CCs.get(relid, relid)
                              for relid in item.Relations.get(Relation.SubtypeOf, [])],
            }
            out_ccs.append(out)
        final_output: dict[str, object] = {
            'db-version': self.version,
            'ccs': out_ccs,
        }
        jout = json.dumps(final_output, indent=2)
        print(jout)


    # What type names does FNBR use?
    FNBR_TYPES = {
        CCType.cxn: 'construction',
        CCType.str: 'strategy',
        CCType.inf: 'information packaging',
        CCType.sem: 'meaning',
    }


###############################################################################
## Command-line parsing

parser = argparse.ArgumentParser(description='Parse the comparative concepts database and export it in different formats.')
parser.add_argument('--quiet', '-q', action='store_true', help=f'suppress warnings')
parser.add_argument('--format', '-f', choices=OutputFormats, help=f'export format')
parser.add_argument('--keys', '-k', nargs='+', default=['Id'],
                    help=f'keys to include in JSON output, or "all" (default: only "Id")')
parser.add_argument('--relations', '-r', nargs='*', default=[],
                    help=f'relations to include in JSON output, or "all" (default: no relations)')
parser.add_argument('--js-object', '-j', type=str,
                    help=f'name Javascript object to store the data (default: output json)')
parser.add_argument('--html', action='store_true', help=f'html in value strings (default: plain text)')
parser.add_argument('--compact', action='store_true', help=f'compact JSON output (default: indented)')
parser.add_argument('--keep-deleted', '-d', action='store_true', help=f'keep deleted terms')
parser.add_argument('cc_database', type=Path, help='YAML database of comparative concepts')


def main(args: argparse.Namespace) -> None:
    validation.set_error_verbosity(not args.quiet)
    if not args.format:
        print("No output format selected, I will only validate the database.", file=sys.stderr)
    glosses: Glosses = validation.parse_yaml_database(args.cc_database, args.keep_deleted)
    validation.validate_database(glosses)
    if args.format:
        validation.reset_errors_and_warnings()
        with open(args.cc_database.with_suffix('.version')) as version:
            ccdb = CCDB(glosses, version.read().strip())
        ccdb.export(args)
        validation.report_errors_and_warnings(f"exporting to {args.format} format")


if __name__ == '__main__':
    try:
        main(parser.parse_args())
    except ValueError as err:
        sys.exit(str(err))

