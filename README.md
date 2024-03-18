# Database of Comparative Concepts
Cross-linked database of Comparative Concepts, extracted from "Morphosyntax: constructions of the world's languages", by William Croft (2022)

## The database parsing script

The script `ccdb_parser.py` parses (and validates) the YAML database and outputs it in different formats. Currently only HTML output is supported.

```
usage: ccdb_parser.py [-h] [--format {html,karp,fnbr}] cc_database

Parse the comparative concepts database and export it in different formats.

positional arguments:
  cc_database           YAML database of comparative concepts

options:
  -h, --help            show this help message and exit
  --format {html,karp,fnbr}, -f {html,karp,fnbr}
                        export format
```

There's a Makefile that reads the database and creates the file `docs/index.html` which is then automatically published here: <https://comparative-concepts.github.io/cc-database/>

## Organisation of the YAML database

The CC database is stored in a YAML file. 
Here is an example of a CC entry:

```
- Id: less affected P [sem]
  Type: sem
  InstanceOf: ""
  Alias:
    - LAP
    - less affected P
  SubtypeOf:
    - P role [sem]
  ConstituentOf: []
  AssociatedTo: []
  Definition: >-
    a <a>function</a> related to the function of the <a>antipassive construction</a>, in which the <a>P</a> <a>participant</a> is less <a>affected</a> than it is in the equivalent event expressed by <a>transitive construction</a>. <i>Example</i>: in <i>The coyote chewed on the deer bone</i>, the deer bone is a less affected P participant than in the transitive <i>The coyote chewed the deer bone</i>. (Section 8.4)
```
This says the the unique id is "less affected P [sem]", and that it has the type "sem". It also has an alternative name, "LAP", and is a subtype of "P role [sem]". The definition is written in a pseudo-html format which can be parsed into correct HTML by the parsing script. 

### YAML type definition

The YAML database consists of a list of entries of the following form:
```
- Id: cc-id (a string)
  Type: one of sem/cxn/inf/str/def
  InstanceOf: cc-id (possibly empty)
  Alias: list of strings (possibly empty)
  SubtypeOf: list of cc-ids (possibly empty)
  ConstituentOf: list of cc-ids (possibly empty)
  AssociatedTo: list of cc-ids (possibly empty)
  Definition: pseudo-html string
```
