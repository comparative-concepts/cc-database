
import sys
import re
import yaml
from enum import Enum
from pathlib import Path
from typing import Any
from pydantic import BaseModel, ConfigDict, ValidationError


###############################################################################
## Types and constants

class CCType(str, Enum):
    cxn = 'cxn'
    str = 'str'
    sem = 'sem'
    inf = 'inf'
    def_ = 'def'
    section = 'section'

class Relation(str, Enum):
    SubtypeOf = 'SubtypeOf'
    ConstituentOf = 'ConstituentOf'
    ExpressionOf = 'ExpressionOf'
    RecruitedFrom = 'RecruitedFrom'
    ModeledOn = 'ModeledOn'
    AttributeOf = 'AttributeOf'
    RoleOf = 'RoleOf'
    HeadOf = 'HeadOf'
    FunctionOf = 'FunctionOf'
    Sections = 'Sections'


class Example(BaseModel):
    model_config = ConfigDict(extra='forbid')
    Example: str
    Language: str
    Gloss: str = ""
    Translation: str = ""
    EquivalentPieces: list[str] = []

class GlossItem(BaseModel):
    model_config = ConfigDict(extra='forbid')
    Id: str
    Name: str
    Type: CCType
    Definition: str = ""
    FromGlossary: bool = True
    Status: str = ""
    Alias: list[str] = []
    Examples: list[str | Example] = []
    Relations: dict[Relation, list[str]] = {}

Glosses = dict[str, GlossItem]


# What general definitions do different types correspond to?
GENERIC_TYPES = {
    CCType.cxn: 'def:construction',
    CCType.str: 'def:strategy',
    CCType.inf: 'def:information-packaging',
    CCType.sem: 'def:meaning',
}

STRATEGY_TYPES = (
    'str:system',
    'str:encoding-strategy',
    'str:recruitment-strategy',
)

RELATION_CCTYPES: dict[Relation, dict[CCType, CCType]] = {
    Relation.SubtypeOf:     {CCType.cxn:CCType.cxn, CCType.str:CCType.str, CCType.inf:CCType.inf, CCType.sem:CCType.sem},
    Relation.ConstituentOf: {CCType.cxn:CCType.cxn, CCType.str:CCType.str, CCType.inf:CCType.inf, CCType.sem:CCType.sem},
    Relation.ExpressionOf:  {CCType.str:CCType.cxn},
    Relation.RecruitedFrom: {CCType.str:CCType.cxn},
    Relation.ModeledOn:     {CCType.str:CCType.cxn},
    Relation.AttributeOf:   {CCType.inf:CCType.inf, CCType.sem:CCType.sem},
    Relation.RoleOf:        {CCType.sem:CCType.sem},
    Relation.HeadOf:        {CCType.cxn:CCType.cxn},
    Relation.FunctionOf:    {CCType.sem:CCType.cxn, CCType.inf:CCType.cxn},
    Relation.Sections:      {CCType.cxn:CCType.section, CCType.str:CCType.section, CCType.inf:CCType.section, CCType.sem:CCType.section, CCType.section:CCType.section},
}

RELATION_KEYS = tuple(RELATION_CCTYPES.keys())

STRUCTURAL_RELATIONS = tuple(
    rel # only relations betwenn CCs of the same type
    for rel, maps in RELATION_CCTYPES.items()
    if all(k == v for k, v in maps.items())
)

CODEWORDS = {
    CCType.cxn: ("clause construction form phrase predicate pronoun "
                 "sentence term verb attributive complement matrix").split(),
    CCType.str: ("affix alignment category classifier co-expression copula incorporation "
                 "indexation marker order position strategy system deranking headed zero").split(),
    CCType.sem: "concept event participant relation role epistemic person".split(),
    CCType.inf: "contrast predication referent".split(),
    CCType.def_: "Hierarchy".split(),
}

IGNORE_CODEWORDS_CCS = {
    "def:comparative-concept",
    "def:form",
    "def:role"
}


###############################################################################
## Main parsing and validation functions

def parse_yaml_database(glossfile: str | Path, keep_deleted: bool = False) -> Glosses:
    reset_errors_and_warnings()
    glosses: Glosses = {}
    with open(glossfile) as F:
        for item in yaml.load(F, Loader=yaml.CLoader):
            if not keep_deleted and item.get('Status') == "deleted":
                continue
            try:
                gitem = convert_glossitem(item)
                gitem.Alias = expand_aliases(gitem)
                glosses[gitem.Id] = gitem
            except ValidationError as e:
                error(f"while parsing {item.get('Id')!r}", str(e))
    add_sections(glosses)
    report_errors_and_warnings("parsing the YAML database")
    return glosses


BOOK_ID = "book"

def add_sections(glosses: Glosses):
    glosses[BOOK_ID] = GlossItem(Id=BOOK_ID, Name="Book", Type=CCType.section)
    for item in list(glosses.values()):
        for section in item.Relations.get(Relation.Sections, ()):
            secparts = section.split(".")
            for i in range(len(secparts)):
                sec = ".".join(secparts[:i+1])
                if sec not in glosses:
                    secname = ("Section " if i > 0 else "Chapter ") + sec
                    parent = ".".join(secparts[:i]) if i > 0 else BOOK_ID
                    glosses[sec] = GlossItem(
                        Id = sec,
                        Name = secname,
                        Type = CCType.section,
                        Relations = {Relation.Sections: [parent]},
                    )


def convert_glossitem(item: dict[str, Any]) -> GlossItem:
    newitem = {key: value for key, value in item.items() if key not in Relation.__members__}
    newitem['Relations'] = {key: value for key, value in item.items() if key in Relation.__members__}
    return GlossItem(**newitem)


def validate_database(glosses: Glosses) -> None:
    reset_errors_and_warnings()
    run_validators(glosses)
    report_errors_and_warnings("validating the database")


###########################################################################
## Expanding aliases

def expand_aliases(item: GlossItem) -> list[str]:
    """
    Expand all aliases in a gloss item - don't include the name itself
    """
    aliases: set[str] = set()
    for alias in [item.Name] + item.Alias:
        aliases.update(expand_alias(alias))
    aliases.discard(item.Name)
    return sorted(aliases)


def expand_alias(alias: str) -> list[str]:
    """
    Expand an alias of the form "a (b) c (d)" into all possible alternatives:
    - "a c", "a b c", "a c d", "a b c d", plus itself "a (b) c (d)"
    Outer commas are also expanded, "a, b (c)" becomes:
    - "a", "b", "b c", as well as "b (c)" and "a, b (c)"
    """
    def expand_parentheses(s: str) -> list[str]:
        m = re.search(r"\(([^()]+)\)", s)
        if not m:
            return [s]
        prefix = s[:m.start()]
        alternatives: list[str] = ["", m.group(1)]
        suffixes = expand_parentheses(s[m.end():])
        return [prefix + alt + suf for alt in alternatives for suf in suffixes]

    result = set([alias])
    for part in re.split(r", *", alias):
        result.add(part)
        for s in expand_parentheses(part):
            s = " ".join(s.split())
            result.add(s)
    return sorted(result)


###############################################################################
## Specific validators

def run_validators(glosses: Glosses):
    for id, item in glosses.items():
        if id != item.Id:
            error("mismatched id", f"{id} != {item.Id!r}")

        current_errors = len(ERROR_SETTINGS['errors'])
        validate_names_and_aliases(item, glosses)
        validate_link_ids(item, glosses)
        validate_consistent_name_and_id(item)
        validate_codewords(item)

        # Run property validators iff there are no schema errors
        if len(ERROR_SETTINGS['errors']) == current_errors and item.Type != CCType.def_:
            validate_isolated(item, glosses)
            validate_relations_by_cctype(item, glosses)
            validate_strategy_supertypes(item, glosses)


def validate_names_and_aliases(item: GlossItem, glosses: Glosses):
    # the name must be unique among names (with the same type)
    id = item.Id
    for id2, item2 in glosses.items():
        if id < id2:
            if item.Type == item2.Type and item.Name == item2.Name:
                error("duplicate name", f"{item.Name!r} is the name of {id!r} and {id2!r}, both of type {item.Type}")
            elif item.Name == item2.Name:
                warning("duplicate name", f"{item.Name!r} is the name of {id!r} and {id2!r}")
    # a name should not be an alias
    for id2, item2 in glosses.items():
        if id != id2:
            if item.Name in item2.Alias:
                warning("name is alias", f"{item.Name!r} is the name of {id!r} but also an alias for {id2!r}")
    # an alias should not be an alias for another CC
    for alias in item.Alias:
        for id2, item2 in glosses.items():
            if id < id2 and "(" not in alias:
                if alias in item2.Alias:
                    warning("duplicate alias", f"{alias!r} is alias for {id!r} and {id2!r}")


def validate_codewords(item: GlossItem):
    if item.Id in IGNORE_CODEWORDS_CCS:
        return

    for type, codewords in CODEWORDS.items():
        if type != item.Type:
            for cword in codewords:
                # if cword in item.Name.split():
                #     warning(f"codeword of wrong type: {item.Id!r} contains codeword {cword!r} for type {type.value!r}")
                if cword == item.Name.split()[-1]:
                    warning("codeword of wrong type", f"{item.Id!r} / {item.Name!r} ends with codeword {cword!r} for type {type.value!r}")


def validate_consistent_name_and_id(item: GlossItem):
    id = item.Id
    name = item.Name.lower()
    if item.Type is CCType.section:
        if id != BOOK_ID and not re.match(r"^[0-9.]+$", id):
            error("section unknown chars", f"{id!r} contains non-permitted chars")
        return
    id_type, _, id_name = id.partition(":")
    if not re.match(r"^[a-z-]+$", id_name):
        error("id unknown chars", f"{id!r} contains non-permitted chars")
    if id_type != item.Type.value:
        warning("id type error", f"{id!r} has the wrong type - it should be {item.Type.value}")
    id_parts = id_name.split("-")
    name_commaparts = re.split(", *", name) + [name]
    mismatches = 0
    for name0 in name_commaparts:
        name_parts = re.split(r"[^a-z]+", name0)
        if not name_parts[0]: name_parts.pop(0)
        if not name_parts[-1]: name_parts.pop()
        if id_parts != name_parts:
            mismatches += 1
    if mismatches == len(name_commaparts):
        warning("name-id mismatch", f"{id!r} != {name!r}")


def validate_link_ids(item: GlossItem, glosses: Glosses):
    # check that ids exits
    for rel, relids in item.Relations.items():
        for relid in relids:
            if rel != "Sections" and relid and relid not in glosses:
                error("missing id", f"id {relid!r} doesn't exist, refered to from {item.Id!r} relation {rel.value!r}")


def validate_isolated(item: GlossItem, glosses: Glosses):
    relations = item.Relations
    out_degree = sum(len(relids) for relids in relations.values())
    in_degree = sum(
        otherid == item.Id
        for gloss in glosses.values()
        for relids in gloss.Relations.values()
        for otherid in relids
    )
    if out_degree == 0 and in_degree == 0:
        warning("isolated CC", f"{item.Id!r} has no structural relations with other concepts")


def validate_relations_by_cctype(item: GlossItem, glosses: Glosses):
    for rel in item.Relations:
        cctypes = RELATION_CCTYPES.get(rel)
        if cctypes:
            if item.Type not in cctypes:
                error("wrong relation", f"{item.Id!r} is of type {item.Type!r} but has a {rel!r} relation")
                continue
            for relid in item.Relations[rel]:
                other = glosses[relid]
                if other.Type != cctypes[item.Type]:
                    error("invalid type", f"{item.Id!r} has {rel!r} relation with CC of invalid type {other.Id!r}")


def validate_strategy_supertypes(item: GlossItem, glosses: Glosses):
    if item.Type != CCType.str or item.Id in STRATEGY_TYPES:
        return
    for super in item.Relations.get(Relation.SubtypeOf, []) + item.Relations.get(Relation.ConstituentOf, []):
        if super in STRATEGY_TYPES:
            return
        elif super.startswith('def:'):
            error("not in taxonomy", f"{item.Id!r} is not in the taxonomy of {', '.join(STRATEGY_TYPES)}")
            return
        else:
            validate_strategy_supertypes(glosses[super], glosses)


###############################################################################
## Error handling

ERROR_SETTINGS: dict[str, list[tuple[str, str]]] = {
    "show-warnings": True,  # type: ignore
    "warnings": [],
    "errors": [],
}

def set_error_verbosity(show: bool):
    ERROR_SETTINGS["show-warnings"] = show  # type: ignore

def reset_errors_and_warnings():
    ERROR_SETTINGS["warnings"].clear()
    ERROR_SETTINGS["errors"].clear()

def report_errors_and_warnings(when: str):
    if ERROR_SETTINGS["show-warnings"] and ERROR_SETTINGS["warnings"]:
        for cat, warn in sorted(ERROR_SETTINGS["warnings"]):
            print(f"WARNING {cat}: {warn}", file=sys.stderr)
        print(f"\n{len(ERROR_SETTINGS['warnings'])} warnings found when {when}\n", file=sys.stderr)
    if ERROR_SETTINGS["errors"]:
        for cat, err in sorted(ERROR_SETTINGS["errors"]):
            print(f"*ERROR* {cat}: {err}", file=sys.stderr)
        print(file=sys.stderr)
        raise ValueError(f"{len(ERROR_SETTINGS['errors'])} errors found when {when}")

def warning(cat: str, warn: str):
    ERROR_SETTINGS["warnings"].append((cat, warn))

def error(cat:str, err: str):
    ERROR_SETTINGS["errors"].append((cat, err))

