
docs/index.html: cc-database.yaml ccdb_parser.py
	python3 ccdb_parser.py --format html $< > $@
