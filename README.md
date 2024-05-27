# Database of Comparative Concepts
Cross-linked database of Comparative Concepts, extracted from "Morphosyntax: constructions of the world's languages", by William Croft (2022)

## Usage

You can use this database in the following ways:

- You can [explore the interactive glossary](https://comparative-concepts.github.io/cc-database/), where you can read definitions and see how different CCs relate to each other.
- You can [play with our interactive visualization](https://comparative-concepts.github.io/cc-database/cc-graph.html), which shows the relations between CCs as self-organizing graphs. You can filter these graphs to focus on just some CCs if you want.
- You can use the raw database in your own applications. It is stored in YAML, and its structure is described below.

## Organisation of the YAML database

The CC database is stored in a YAML file. 
Here is an example of a CC entry:

https://github.com/comparative-concepts/cc-database/blob/7d4b779171aa3bbda6147bdcbb797e3da3d30598/cc-database.yaml#L5675-L5686

This says the the unique id is `sem:less-affected-p`, it has the name "**less affected P**" and the type "**sem**". It also has an alternative name, "**LAP**", and is a subtype of `sem:p-role`. The definition is written in a pseudo-html format which can be parsed into correct HTML by the parsing script. Finally there are two example sentences that are extracted from the definition.

### YAML type definition

The YAML database consists of a list of entries of the following form:
```
- Id: cc-id (a string)
  Name: str
  Alias: list of strings (possibly empty)
  Type: one of sem/cxn/inf/str/def
  Definition: pseudo-html string
  Examples: list of examples, either as plain strings or with information about language, gloss, translation, etc.

  SubtypeOf, ConstituentOf, HeadOf, 
  AttributeOf, RoleOf, FillerOf,
  ExpressionOf, ModeledOn, RecruitedFrom: these are the different relations, stored as lists of cc-ids
```

## The database parsing script

The script `ccdb_parser.py` parses (and validates) the YAML database and outputs it in different formats. Currently only HTML output is supported.

```
usage: ccdb_parser.py [-h] [--quiet] [--format {html,karp,fnbr,graph}] [--keep-deleted] cc_database

Parse the comparative concepts database and export it in different formats.

positional arguments:
  cc_database           YAML database of comparative concepts

options:
  -h, --help            show this help message and exit
  --quiet, -q           suppress warnings
  --format FMT, -f FMT  export format (FMT = html, karp, fnbr, graph)
  --keep-deleted, -d    keep deleted terms
```

There's a Makefile that reads the database and creates the files `docs/index.html` and `docs/cc-graph-data.js`. 
They are used in the [interactive glossary](https://comparative-concepts.github.io/cc-database>) 
and the [interactive visualization](https://comparative-concepts.github.io/cc-database/cc-graph.html).

