
docs/index.html: cc-database.yaml
	python3 build-cc-webpage.py $< > $@
