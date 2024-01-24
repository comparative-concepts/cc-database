import sys
import inspect
from typing import TypedDict, Union

# A parsed definition is a list of either strings or links (as pairs of strings)
ParsedDefinition = list[Union[str, tuple[str, str]]]

# The type of glossary items
class GlossItem(TypedDict):
    Id: str
    Name: str
    Type: str
    Alias: list[str]
    SubtypeOf: list[str]
    ConstituentOf: list[str]
    ExpressionOf: list[str]
    RecruitedFrom: list[str]
    ModeledOn: list[str]
    FunctionOf: list[str]
    AttributeOf: list[str]
    ValueOf: list[str]
    RoleOf: list[str]
    FillerOf: list[str]
    AssociatedTo: list[str]
    Definition: str
    DefinitionLinks: list[str]
    ParsedDefinition: ParsedDefinition

# Constants
STRATEGY_TYPES = ('str:system', 'str:encoding-strategy', 'str:recruitment-strategy')
RELATION_CCTYPES = {
    "SubtypeOf":     { "cxn":"cxn", "str":"str", "inf":"inf", "sem":"sem" },
    "ConstituentOf": { "cxn":"cxn", "str":"str", "inf":"inf", "sem":"sem" },
    "ExpressionOf":  { "str":"cxn" },
    "RecruitedFrom": { "str":"cxn" },
    "ModeledOn":     { "str":"cxn" },
    "FunctionOf":    { "inf":"cxn", "sem":"cxn" },
    "AttributeOf":   { "inf":"inf", "sem":"sem" },
    "ValueOf":       { "inf":"inf", "sem":"sem" },
    "RoleOf":        { "sem":"sem" },
    "FillerOf":      { "sem":"sem" },
}
RELATION_KEYS = tuple(RELATION_CCTYPES.keys())
STRUCTURAL_RELATIONS = tuple(
    rel # only relations betwenn CCs of the same type
    for rel, maps in RELATION_CCTYPES.items()
    if all(k == v for k, v in maps.items())
)


def type_check(item) -> list[str]:
    errors = []
    # type check
    for key in ('Id', 'Name', 'Type', 'Definition'):
        if not isinstance(item[key], str):
            errors.append(f"Type error: {key} is not str.")
    for key in RELATION_KEYS:
        if not isinstance(item[key], list) or any(not isinstance(x, str) for x in item[key]):
            errors.append(f"Type error: {key} is not list[str].")
    for x in item['ParsedDefinition']:
        if isinstance(x, tuple) and (len(x) != 2 or any(not isinstance(y, str) for y in x)):
            errors.append(f"Type error: {key} is not of type {ParsedDefinition}.")
    return errors


def validate_cctype(item) -> list[str]:
    # check the CC type
    if item['Type'] not in ('cxn', 'inf', 'sem', 'str', 'def'):
        return [f"Unknown CC type: {item['Type']}"]
    else:
        return []


def validate_names_and_aliases(item, glosses) -> list[str]:
    errors = []
    # the name must be unique among names (with the same type)
    for id2, item2 in glosses.items():
        if item['Id'] != id2 and item['Type'] == item2['Type'] and item['Name'] == item2['Name']: 
            errors.append(f"{item['Id']}: Name also occurs in {id2!r}")
    # an alias should not be a name
    for alias in item['Alias']:
        for id2, item2 in glosses.items():
            if alias == item2['Name']:
                errors.append(f"Alias {alias!r} is also the name for id {id2!r}")
    if len(set(item['Alias'])) != len(item['Alias']):
        errors.append(f"Duplicate aliases: {item['Alias']}")
    return errors


def validate_link_ids(item, glosses) -> list[str]:
    errors = []
    # check that ids exits
    for key in RELATION_KEYS + ('ParsedDefinition', ):
        relids = item[key]
        if isinstance(relids, str): relids = [relids]
        for relid in relids:
            if not relid: continue
            if key == 'ParsedDefinition':
                if isinstance(relid, str): continue
                relid = relid[0] # type: ignore
            if relid not in glosses:
                errors.append(f"{key} id doesn't exist: {relid!r}")
    return errors


def validate_isolated(item: GlossItem, glosses: list[GlossItem]) -> list[str]:
    out_degree = sum([len(item[relation]) for relation in STRUCTURAL_RELATIONS ])
    in_degree = sum(
        1
        for gloss in glosses.values()
        for relation in STRUCTURAL_RELATIONS
        for otherid in gloss[relation]
        if otherid == item['Id']
    )

    if out_degree == 0 and in_degree == 0:
        return [f"{item['Id']} is isolated: it has no structural relations with other concepts."]
    else:
        return []


def validate_relations_by_cctype(item: GlossItem, glosses: list[GlossItem]) -> list[str]:
    errors = []
    for relation, cctypes in RELATION_CCTYPES.items():
        if len(item[relation]) > 0 and item["Type"] not in cctypes.keys():
            errors.append(f"{item['Id']} is of type {item['Type']} but has a 'ExpressionOf' relation.")
            continue

        for key in item[relation]:
            other = glosses[key]
            if other['Type'] not in cctypes[item['Type']]:
                errors.append(f"{item['Id']} has '{relation}' relation with CC of invalid type: {other['Id']}")

    return errors


def validate_strategy_supertypes(item: GlossItem, glosses: list[GlossItem]) -> list[str]:
    if item['Type'] != 'str' or item['Id'] in STRATEGY_TYPES:
        return []

    errors = [] 
    for super in item['SubtypeOf']+item['ConstituentOf']:
        if super in STRATEGY_TYPES:
            return []
        elif super == 'def:strategy':
            return [f"{item['Id']} is not in the taxonomy of: {STRATEGY_TYPES}"]
        else:
            errors += validate_strategy_supertypes(glosses[super], glosses)
    
    return errors


def run_validators(ccdb) -> list[str]:
    errors = []
    for id, item in ccdb.glosses.items():
        item_errors = []
        if id != item["Id"]:
            errors.append(f"Mismatched id, != {item['Id']!r}")
        
        item_errors += type_check(item)
        item_errors += validate_cctype(item)
        item_errors += validate_names_and_aliases(item, ccdb.glosses)
        item_errors += validate_link_ids(item, ccdb.glosses)

        # Run property validators iff there are no schema errors
        if len(item_errors) == 0 and item['Type'] != 'def':
            item_errors += validate_isolated(item, ccdb.glosses)
            item_errors += validate_relations_by_cctype(item, ccdb.glosses)
            item_errors += validate_strategy_supertypes(item, ccdb.glosses)

        errors.extend(item_errors)
    return sorted(set(errors))