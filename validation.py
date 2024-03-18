
import sys
import yaml
from enum import Enum
from pathlib import Path
from typing import Any
from pydantic import BaseModel, ValidationError


###############################################################################
## Types and constants

class CCType(str, Enum):
    cxn = 'cxn'
    str = 'str'
    sem = 'sem'
    inf = 'inf'
    def_ = 'def'

class Relation(str, Enum):
    SubtypeOf = 'SubtypeOf'
    ConstituentOf = 'ConstituentOf'
    ExpressionOf = 'ExpressionOf'
    RecruitedFrom = 'RecruitedFrom'
    ModeledOn = 'ModeledOn'
    FunctionOf = 'FunctionOf'
    AttributeOf = 'AttributeOf'
    ValueOf = 'ValueOf'
    RoleOf = 'RoleOf'
    FillerOf = 'FillerOf'
    AssociatedTo = 'AssociatedTo'


class Example(BaseModel):
    Example: str
    Language: str
    Gloss: str = ""
    Translation: str = ""
    EquivalentPieces: list[str] = []

class GlossItem(BaseModel):
    Id: str
    Name: str
    Type: CCType
    Definition: str
    FromGlossary: bool = True
    Alias: list[str] = []
    Examples: list[str | Example] = []
    Relations: dict[Relation, list[str]]

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

RELATION_CCTYPES = {
    Relation.SubtypeOf:     {CCType.cxn:CCType.cxn, CCType.str:CCType.str, CCType.inf:CCType.inf, CCType.sem:CCType.sem},
    Relation.ConstituentOf: {CCType.cxn:CCType.cxn, CCType.str:CCType.str, CCType.inf:CCType.inf, CCType.sem:CCType.sem},
    Relation.ExpressionOf:  {CCType.str:CCType.cxn},
    Relation.RecruitedFrom: {CCType.str:CCType.cxn},
    Relation.ModeledOn:     {CCType.str:CCType.cxn},
    Relation.FunctionOf:    {CCType.inf:CCType.cxn, CCType.sem:CCType.cxn},
    Relation.AttributeOf:   {CCType.inf:CCType.inf, CCType.sem:CCType.sem},
    Relation.ValueOf:       {CCType.inf:CCType.inf, CCType.sem:CCType.sem},
    Relation.RoleOf:        {CCType.sem:CCType.sem},
    Relation.FillerOf:      {CCType.sem:CCType.sem},
}

RELATION_KEYS = tuple(RELATION_CCTYPES.keys())

STRUCTURAL_RELATIONS = tuple(
    rel # only relations betwenn CCs of the same type
    for rel, maps in RELATION_CCTYPES.items()
    if all(k == v for k, v in maps.items())
)


###############################################################################
## Main parsing and validation functions

def parse_yaml_database(glossfile: str | Path) -> Glosses:
    reset_errors_and_warnings()
    glosses: Glosses = {}
    with open(glossfile) as F:
        for item in yaml.load(F, Loader=yaml.CLoader):
            try:
                glosses[item['Id']] = convert_glossitem(item)
            except ValidationError as e:
                error(f"while parsing {item['Id']!r}: {e}\n")
    report_errors_and_warnings("parsing the YAML database")
    return glosses


def convert_glossitem(item: dict[str, Any]) -> GlossItem:
    newitem = {key: value for key, value in item.items() if key not in Relation.__members__}
    newitem['Relations'] = {key: value for key, value in item.items() if key in Relation.__members__}
    return GlossItem(**newitem)


def validate_database(glosses: Glosses) -> None:
    reset_errors_and_warnings()
    run_validators(glosses)
    report_errors_and_warnings("validating the database")


###############################################################################
## Specific validators

def run_validators(glosses: Glosses):
    for id, item in glosses.items():
        if id != item.Id:
            error(f"Mismatched id, != {item.Id!r}")

        current_errors = len(ERROR_SETTINGS['errors'])
        validate_names_and_aliases(item, glosses)
        validate_link_ids(item, glosses)

        # Run property validators iff there are no schema errors
        if len(ERROR_SETTINGS['errors']) == current_errors and item.Type != CCType.def_:
            validate_isolated(item, glosses)
            validate_relations_by_cctype(item, glosses)
            validate_strategy_supertypes(item, glosses)


def validate_names_and_aliases(item: GlossItem, glosses: Glosses):
    # the name must be unique among names (with the same type)
    id = item.Id
    for id2, item2 in glosses.items():
        if id == id2: 
            continue
        if item.Type == item2.Type and item.Name == item2.Name: 
            error(f"{id!r}: Name also occurs in {id2!r}")
        elif item.Name == item2.Name: 
            warning(f"{id!r} and {id2!r} has the same name: {item.Name!r}")
    # # an alias should not be a name
    # for alias in item.Alias:
    #     for id2, item2 in glosses.items():
    #         if id == id2: continue
    #         if alias == item2.Name:
    #             error(f"{id}: Alias {alias!r} is also the name for id {id2!r}")
    if len(set(item.Alias)) != len(item.Alias):
        error(f"{id!r}: Duplicate aliases: {item.Alias!r}")


def validate_link_ids(item: GlossItem, glosses: Glosses):
    # check that ids exits
    for rel, relids in item.Relations.items():
        for relid in relids:
            if relid and relid not in glosses:
                error(f"{id!r}: {rel!r} id doesn't exist: {relid!r}")


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
        warning(f"{item.Id!r} is isolated: it has no structural relations with other concepts.")


def validate_relations_by_cctype(item: GlossItem, glosses: Glosses):
    for rel in item.Relations:
        cctypes = RELATION_CCTYPES.get(rel)
        if cctypes:
            if item.Type not in cctypes:
                error(f"{item.Id!r} is of type {item.Type!r} but has a {rel!r} relation.")
                continue
            for relid in item.Relations[rel]:
                other = glosses[relid]
                if other.Type != cctypes[item.Type]:
                    error(f"{item.Id!r} has '{rel!r}' relation with CC of invalid type: {other.Id!r}")


def validate_strategy_supertypes(item: GlossItem, glosses: Glosses):
    if item.Type != CCType.str or item.Id in STRATEGY_TYPES:
        return
    for super in item.Relations.get(Relation.SubtypeOf, []) + item.Relations.get(Relation.ConstituentOf, []):
        if super in STRATEGY_TYPES:
            return
        elif super.startswith('def:'):
            error(f"{item.Id!r} is not in the taxonomy of: {', '.join(STRATEGY_TYPES)}")
            return
        else:
            validate_strategy_supertypes(glosses[super], glosses)


###############################################################################
## Error handling

ERROR_SETTINGS: dict[str, list[str]] = {
    "show-warnings": True, # type: ignore
    "warnings": [],
    "errors": [],
}
# SHOW_WARNINGS = True
# WARNINGS: list[str] = []
# ERRORS: list[str] = []

def set_error_verbosity(show: bool):
    ERROR_SETTINGS["show-warnings"] = show # type: ignore

def reset_errors_and_warnings():
    ERROR_SETTINGS["warnings"].clear()
    ERROR_SETTINGS["errors"].clear()

def report_errors_and_warnings(when: str):
    if ERROR_SETTINGS["show-warnings"] and ERROR_SETTINGS["warnings"]:
        for warn in ERROR_SETTINGS["warnings"]:
            print(f"WARNING {warn}", file=sys.stderr)
        print(f"\n{len(ERROR_SETTINGS['warnings'])} warnings found when {when}\n", file=sys.stderr)
    if ERROR_SETTINGS["errors"]:
        for err in ERROR_SETTINGS["errors"]:
            print(f"*ERROR* {err}", file=sys.stderr)
        print(file=sys.stderr)
        raise ValueError(f"{len(ERROR_SETTINGS['errors'])} errors found when {when}")

def warning(warn: str):
    ERROR_SETTINGS["warnings"].append(warn)

def error(err: str):
    ERROR_SETTINGS["errors"].append(err)

