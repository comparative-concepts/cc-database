import sys
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
    AssociatedTo: list[str]
    Definition: str
    DefinitionLinks: list[str]
    ParsedDefinition: ParsedDefinition


MAIN_CC_TYPES = ('def:construction', 'def:meaning', 'def:information-packaging', 'def:strategy')
MAIN_STRATEGY_TYPES = ('str:system', 'str:encoding-strategy', 'str:recruitment-strategy')


def type_check(item) -> list[str]:
    errors = []
    # type check
    for key in ('Id', 'Name', 'Type', 'Definition'):
        if not isinstance(item[key], str):
            errors.append(f"Type error: {key} is not str")
    for key in ('Alias', 'SubtypeOf', 'ConstituentOf', 'ExpressionOf', 'RecruitedFrom', 'ModeledOn', 'FunctionOf', 'AssociatedTo', 'DefinitionLinks'):
        if not isinstance(item[key], list) or any(not isinstance(x, str) for x in item[key]):
            errors.append(f"Type error: {key} is not list[str]")
    for key in ('ParsedDefinition',):
        for x in item[key]:
            if isinstance(x, tuple) and (len(x) != 2 or any(not isinstance(y, str) for y in x)):
                errors.append(f"Type error: {key} is not of type {ParsedDefinition}")
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
            errors.append(f"{Item['Id']}: Name also occurs in {id2!r}")
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
    for key in ('SubtypeOf', 'ConstituentOf', 'ExpressionOf', 'RecruitedFrom', 'ModeledOn', 'FunctionOf', 'AssociatedTo', 'DefinitionLinks', 'ParsedDefinition'):
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


def validate_orphan(item) -> list[str]:
    if len(item['SubtypeOf']) == 0 and len(item['ConstituentOf']) == 0:
        return [f"{item['Id']} is not a subtype or part of another CC (orphan)"]
    else:
        return []


def validate_same_type_relations(item, glosses) -> list[str]:
    errors = []
    for key in item['SubtypeOf']:
        if key in MAIN_CC_TYPES: continue
        super = glosses[key]
        if item['Type'] != super['Type']:
            errors.append(f"{item['Id']} subtype of CC with another type: {super['Id']}")
    for key in item['ConstituentOf']:
        if key in MAIN_CC_TYPES: continue
        whole = glosses[key]
        if item['Type'] != whole['Type']:
            errors.append(f"{item['Id']} partonomic relation with CC of another type: {whole['Id']}")
    return errors


def validate_strategy_supertypes(item, glosses) -> list[str]:
    if item['Type'] != 'str' or item['Id'] in MAIN_STRATEGY_TYPES:
        return []

    errors = [] 
    for super in item['SubtypeOf']+item['ConstituentOf']:
        if super in MAIN_STRATEGY_TYPES:
            return []
        elif super == 'def:strategy':
            return [f"{item['Id']} is not in the taxonomy of: {MAIN_STRATEGY_TYPES}"]
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
            item_errors += validate_orphan(item)
            item_errors += validate_same_type_relations(item, ccdb.glosses)
            item_errors += validate_strategy_supertypes(item, ccdb.glosses)

        errors.extend(item_errors)
    return list(set(errors))