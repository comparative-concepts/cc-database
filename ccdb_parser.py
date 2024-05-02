
import sys
import re
import json
import argparse
from typing import TypedDict
from pathlib import Path
from datetime import datetime

import validation
from validation import CCType, Relation, RELATION_CCTYPES, Glosses, GlossItem, error


# A parsed definition is a list of either strings or links (as pairs of strings)
ParsedDefinition = list[str | tuple[str, str]]

# The different formats that we can export the database to
OutputFormats = ['html', 'karp', 'fnbr', 'graph']

# Graph nodes and edges
GraphNode = TypedDict("GraphNode", {"id": str, "label": str, "group": str})
GraphEdge = TypedDict("GraphEdge", {"from": str, "to": str, "rel": str})


class CCDB:
    glosses: Glosses
    allnames: dict[str, tuple[str,...]]
    definitions: dict[str, ParsedDefinition]
    links: dict[str, list[str]]

    def __init__(self, glosses: Glosses):
        self.glosses = glosses

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


    def export(self, format: str):
        if format == "html":
            self.print_html()
        elif format == "karp":
            self.export_to_karp()
        elif format == "fnbr":
            self.export_to_fnbr()
        elif format == "graph":
            self.export_to_graph()


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

                if link_ref:
                    link = link_ref
                    linkids = [link]
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
                    if len(linkids) > 1:
                        error(id, f"Ambiguous link '{link}', maps to any of {linkids}")
                    linkid = linkids[0]
                links.append(linkid)
                part = (linkid, name)
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
    TYPE_ENDINGS = {
        'cxn': ['construction', 'constructions'],
        'str': ['strategy', 'strategies', 'category', 'categories'],
        'inf': ['construal', 'information packaging', 'referent', 'referents'],
        'sem': ['role', 'roles', 'relation', 'relations'],
        'def': [],
    }

    ###########################################################################
    ## HTML export

    def expand_link(self, id: str, name: str|None = None) -> str:
        """Expand an abbreviated link "<a>name</a>" into the form "<a id>name</a>"."""
        if name is None: 
            name = id
        if id in self.glosses:
            return f'<a {id}>{name}</a>'
        else:
            return f'<notfound><a {id}>{name}</a></notfound>'


    @staticmethod
    def html_friendly_name(name: str) -> str:
        """Make CC names (ids, aliases) html-friendly."""
        return (name
            .replace('---', '\u2014') # em-dash
            .replace('--', '\u2013') # en-dash
            .replace('[', '(<i>').replace(']', '</i>)')
        )


    def convert_link_to_html(self, id: str, name: str|None = None, selfid: str|None = None) -> str:
        """Convert a CC link into HTML, with an actual link to the CC in the database."""
        if name is None: 
            item = self.glosses[id]
            name = f"{item.Name} [{item.Type.value}]"
        html_name = self.html_friendly_name(name)
        if id == selfid:
            return f'<strong>{html_name}</strong>'
        else:
            return f'<a href="#{id}">{html_name}</a>'


    def convert_definition_to_html(self, definition: ParsedDefinition) -> str:
        """Convert a CC definition into HTML, with actual links to the CCs in the database."""
        html_parts: list[str] = []
        for part in definition:
            if isinstance(part, tuple):
                part = self.convert_link_to_html(*part)
            html_parts.append(part)
        return self.clean_definition_html(''.join(html_parts))


    def print_relation_list(self, relations: list[str]|None, name: str):
        """Prints an html version of a list of related CCs, with links to these CCs."""
        if relations:
            print(f'<tr><th>{name}</th> <td class="ccinfo relation">' +
                    ' | '.join(map(self.convert_link_to_html, relations)) +
                    '</td></tr>')


    def print_hierarchy(self, item: GlossItem, relation_types: list[Relation], name: str):
        id = item.Id
        parents = [(parent, rel) for rel in relation_types for parent in item.Relations.get(rel, ())]
        children = [
            (chid, rel)
            for rel in relation_types
            for chid, child in self.glosses.items()
            if id in child.Relations.get(rel, ())
        ]
        if parents or children:
            print(f'<tr><th>{name}</th> <td class="ccinfo relation"> <table>')
            print(f'<table>')
            if parents:
                print('<tr><td class="flex">')
                for parent, rel in parents:
                    pre_text = '<i>(head)</i>' if rel == Relation.HeadOf else ''
                    print(f'<span>{pre_text} {self.convert_link_to_html(parent)}</span>')
                print('</td></tr>')
            print('<tr><td>')
            print(self.convert_link_to_html(id, selfid=id))
            print('</td></tr>')
            if children:
                print('<tr><td class="flex">')
                for child, rel in children:
                    pre_text = '<i>(head)</i>' if rel == Relation.HeadOf else ''
                    print(f'<span>{pre_text} {self.convert_link_to_html(child)}</span>')
                print('</td></tr>')
            print('</table></td></tr>')


    @staticmethod
    def clean_definition_html(definition: str) -> str:
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
        print(f"<p>Extracted and expanded from the appendix of <em>Morphosyntax: Constructions of the World's Languages</em>, by William Croft (2022)")
        print(f'<p><strong>Build date/time:</strong> {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>')

        glossitems = sorted(self.glosses.items(), key=lambda it:str.casefold(it[1].Name))

        nlinks = sum(len(links) for links in self.links.values())
        ntypedlinks = sum(len(relids) for _, item in glossitems for relids in item.Relations.values())
        print(f'<p><strong>Statistics:</strong> {len(glossitems)} CCs, ' 
              f'with {ntypedlinks} typed relations and {nlinks} links within CC definitions</p>')

        print('<div id="glosses">')
        for id, item in glossitems:
            print(f'<div class="cc" id="{id}">')
            print(f'<h2 class="name">{self.convert_link_to_html(id)}</h2>')
            print(f'<table>')

            print(f'<tr><th>Id</th> <td class="ccinfo ccid">{id}</td></tr>')

            if item.Type:
                entry = validation.GENERIC_TYPES.get(item.Type)
                if entry:
                    _, _, entryname = entry.partition(":")
                    entryname = entryname.replace("-", " ")
                    type = self.convert_link_to_html(entry, entryname)
                elif item.Type == CCType.def_:
                    # Just a better alias for the HTML
                    type = 'definition'
                else:
                    error(id, f"Type not found: {item.Type}")
                    type = f'<span class="notfound">{item.Type}</span>'
                print(f'<tr><th>Type</th> <td class="ccinfo type">{type}</td></tr>')

            aliases: list[str] = [item.Name] + item.Alias
            if aliases:
                print('<th>Alias(es)</th> <td class="ccinfo name">' +
                      ' | '.join(map(self.html_friendly_name, aliases)) +
                      '</td></tr>')

            relations = item.Relations
            self.print_relation_list(relations.get(Relation.ExpressionOf), "Expresses")
            self.print_relation_list(relations.get(Relation.RecruitedFrom), "Recruited from")
            self.print_relation_list(relations.get(Relation.ModeledOn), "Modeled on")
            self.print_relation_list(relations.get(Relation.FunctionOf), "Function of")
            self.print_relation_list(relations.get(Relation.AttributeOf), "Attribute of")
            self.print_relation_list(relations.get(Relation.ValueOf), "Value of")
            self.print_relation_list(relations.get(Relation.RoleOf), "Role of")
            self.print_relation_list(relations.get(Relation.FillerOf), "Filler of")
            self.print_relation_list(relations.get(Relation.AssociatedTo), "Associated")

            self.print_hierarchy(item, [Relation.SubtypeOf], 'Taxonomy')
            self.print_hierarchy(item, [Relation.HeadOf, Relation.ConstituentOf], 'Partonomy')

            if id in self.definitions:
                print(f'<tr><th>Definition</th> <td class="ccinfo definition">' +
                      self.convert_definition_to_html(self.definitions[id]) +
                      '</td></tr>')

            if not item.FromGlossary:
                print('''<tr><th></th><td>
                      <span class="notfound">
                        Not from the original glossary of <em>Morphosyntax</em>.
                      </span></td></tr>''')

            print('</table>')
            print('</div>')
        print('</div>')
        print('</body></html>')


    ###########################################################################
    ## Export to a graph as Javascript objects

    def export_to_graph(self):
        reltypes: dict[str, list[list[str]]] = {}
        for rel, maps in RELATION_CCTYPES.items():
            reltypes[rel] = []
            for from_type, to_type in maps.items():
                if from_type == to_type:
                    reltypes[rel].append([from_type])
                else:
                    reltypes[rel].append([from_type, to_type])

        nodes: list[GraphNode] = []
        edges: list[GraphEdge] = []
        for item in self.glosses.values():
            nodes.append({
                "id": item.Id,
                "label": item.Name.replace(" ", "\n"),
                "group": item.Type,
            })
            for rel in item.Relations:
                for target in item.Relations.get(rel, []):
                    edges.append({
                        "from": item.Id,
                        "to": target,
                        "rel": rel,
                    })

        print("\n".join([
            f"var ccRelations = {json.dumps(reltypes)};",
            f"var ccNodes = {json.dumps(nodes)};",
            f"var ccEdges = {json.dumps(edges)};",
        ]))

    ###########################################################################
    ## Export to Språkbanken Karp JSON-lines format

    @staticmethod
    def convert_definition_to_karp(definition: ParsedDefinition) -> str:
        """Convert a CC definition into a Karp-formatted string."""
        karp_parts: list[str] = []
        for part in definition:
            if isinstance(part, tuple):
                assert "[" not in part[1] and "]" not in part[1], f"[] in link name: {part}"
                part = f"[a {part[0]} {part[1]}]"
            else:
                part = part.replace(r"[", r"\[").replace(r"]", r"\]")
                part = re.sub(r"<(\w+)>", r"[\1 ", part)
                part = re.sub(r"</(\w+)>", r"]", part)
            karp_parts.append(part)
        return ''.join(karp_parts)


    def export_to_karp(self):
        """Export the whole database as a single JSON-lines file for use in Karp."""
        for id in sorted(self.glosses, key=str.casefold):
            item: GlossItem = self.glosses[id]
            out = {
                'Id': item.Id,
                'Type': item.Type.value,
                'Name': item.Name,
                'Alias': item.Alias,
                'SubtypeOf': item.Relations.get(Relation.SubtypeOf, []),
            }
            if id in self.definitions: 
                out['Definition'] = self.convert_definition_to_karp(self.definitions[id])
            print(json.dumps(out))


    ###########################################################################
    ## Export to FrameNet Brazil JSON format

    def export_to_fnbr(self):
        """Export the database to the same JSON format as FrameNet Brazil."""
        # Special cases (e.g., "strategy [def]" is "strategy [str]" in FNBr)
        SPECIAL_FNBR_CCs = {
            id: id.replace('def:', typ.value + ':')
            for typ, id in validation.GENERIC_TYPES.items()
        }
        out_ccs: list[dict[str, str|list[str]]] = []
        for id in sorted(self.glosses, key=str.casefold):
            item = self.glosses[id]
            if not (item.Type in self.FNBR_TYPES or id in SPECIAL_FNBR_CCs):
                continue
            out = {
                'id': SPECIAL_FNBR_CCs.get(item.Id, item.Id),
                'name': item.Name,
                'type': self.FNBR_TYPES.get(item.Type, item.Type),
                'definition': item.Definition,
                'subTypeOf': [SPECIAL_FNBR_CCs.get(relid, relid) 
                              for relid in item.Relations.get(Relation.SubtypeOf, [])],
            }
            if Relation.AssociatedTo in item.Relations:
                out['associatedTo'] = [SPECIAL_FNBR_CCs.get(relid, relid) 
                                       for relid in item.Relations[Relation.AssociatedTo]]
            out_ccs.append(out)
        final_output = {
            'db-version': "export from cc-database",
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
parser.add_argument('--keep-deleted', '-d', action='store_true', help=f'keep deleted terms')
parser.add_argument('cc_database', type=Path, help='YAML database of comparative concepts')


def main(args: argparse.Namespace):
    validation.set_error_verbosity(not args.quiet)
    if not args.format:
        print("No output format selected, I will only validate the database.", file=sys.stderr)
    glosses: Glosses = validation.parse_yaml_database(args.cc_database, args.keep_deleted)
    validation.validate_database(glosses)
    validation.reset_errors_and_warnings()
    ccdb = CCDB(glosses)
    if args.format:
        ccdb.export(args.format)
    validation.report_errors_and_warnings(f"exporting to {args.format} format")


if __name__ == '__main__':
    try:
        main(parser.parse_args())
    except ValueError as err:
        sys.exit(str(err))

