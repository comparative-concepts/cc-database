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

There's a Makefile that reads the database and creates the file `docs/index.html` which is then automatically published here: <https://spraakbanken.github.io/ComparativeConcepts>

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
  AssociatedTo: []
  Definition: >-
    a <a>function</a> related to the function of the <a>antipassive construction</a>, in which the <a>P</a> <a>participant</a> is less <a>affected</a> than it is in the equivalent event expressed by <a>transitive construction</a>. <i>Example</i>: in <i>The coyote chewed on the deer bone</i>, the deer bone is a less affected P participant than in the transitive <i>The coyote chewed the deer bone</i>. (Section 8.4)
```
This says the the unique id is "less affected P [sem]", and that it has the type "sem". It also has an alternative name, "LAP", and is a subtype of "P role [sem]". The definition is written in a pseudo-html format which can be parsed into correct HTML by the parsing script. 

There are also "umbrella" concepts, such as this:
```
- Id: affecting event [sem] / verb [cxn]
  Type: sem/cxn
  InstanceOf: ""
  Alias:
    - affecting event/verb
    - affecting
  SubtypeOf: []
  AssociatedTo: []
  Definition: >-
    an <a>experiential event</a> which describes the <a>stimulus</a> causing a change in mental state of the <a>experiencer</a>; and a <a>verb</a> that expresses such an event. <i>Example</i>: <i>The dog surprised me</i> is an instance of an affecting event, and <i>surprise</i> is an affecting verb. (Section 7.4)
```
This really is a merger of two distinct concepts (of types "sem" and "cxn"), but they share the same definition that are implicitly associated to each other.
One of the instances of "affecting event [sem] / verb [cxn]" is the following:
```
- Id: affecting event [sem]
  Type: sem
  InstanceOf: affecting event [sem] / verb [cxn]
  Alias:
    - affecting event
  SubtypeOf:
    - experiential event [sem]
  AssociatedTo:
    - stimulus-oriented strategy [str]
  Definition: ""
```
This concept doesn't have a definition, because it shares the same definition as it's "parent".

### YAML type definition

The YAML database consists of a list of entries of the following form:
```
- Id: cc-id (a string)
  Type: one of sem/cxn/inf/str/def
  InstanceOf: cc-id (possibly empty)
  Alias: list of strings (possibly empty)
  SubtypeOf: list of cc-ids (possibly empty)
  AssociatedTo: list of cc-ids (possibly empty)
  Definition: pseudo-html string
```
