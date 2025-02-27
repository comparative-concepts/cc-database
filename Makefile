
.DELETE_ON_ERROR:

.PHONY: validate

all: validate docs/index.html docs/cc-graph-data.js docs/cc-simple-list.json

validate: cc-database.yaml
	python3 ccdb_parser.py $<
	./validate-db-version.sh

docs/index.html: cc-database.yaml ccdb_parser.py
	python3 ccdb_parser.py --quiet --format html $< > $@

docs/cc-graph-data.js: cc-database.yaml ccdb_parser.py
	python3 ccdb_parser.py --quiet --format graph $< > $@

docs/cc-simple-list.json: cc-database.yaml ccdb_parser.py
	python3 ccdb_parser.py --quiet --format json --keys Id Name Type -- $< > $@
